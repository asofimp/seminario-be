import {
  Logger,
  NotFoundException,
  OnModuleDestroy,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Namespace, Socket } from 'socket.io';
import { AnalyticsService } from '../analytics/analytics.service';
import { Events } from '../common/events';
import type {
  PresentationStateChangedEvent,
  QaChangedEvent,
  ResponseSubmittedEvent,
} from '../common/events';
import { WsExceptionFilter } from '../common/filters/ws-exception.filter';
import { resolveControlKey } from '../common/guards/control-access';
import { UpdateStateDto } from '../presentations/dto/update-state.dto';
import { PresentationsService } from '../presentations/presentations.service';
import { SubmitResponseDto } from '../responses/dto/submit-response.dto';
import { ResponsesService } from '../responses/responses.service';
import { AskQuestionDto } from '../qa/dto/ask-question.dto';
import { QaService } from '../qa/qa.service';

export type ClientRole = 'audience' | 'screen' | 'admin';
const ROLES: ClientRole[] = ['audience', 'screen', 'admin'];

interface ClientData {
  code: string;
  role: ClientRole;
}
type LiveSocket = Socket<any, any, any, ClientData>;

// Con 0.1 de CPU: los resultados se recalculan como máximo 1 vez por segundo y
// el contador de conectados se agrupa en ventanas de 1 s.
const RESULTS_DEBOUNCE_MS = 1000;
const PARTICIPANTS_DEBOUNCE_MS = 1000;

const room = (code: string, role?: ClientRole) =>
  role ? `${code}:${role}` : code;

// Clients connect with: io(`${API}/live`, { auth: { code, role, adminKey? } })
@WebSocketGateway({
  namespace: 'live',
  cors: { origin: true },
  // Con 0.1 de CPU un pico (100 personas entrando/votando a la vez) puede
  // retrasar los pings: más margen antes de dar la conexión por muerta.
  pingInterval: 25_000,
  pingTimeout: 60_000,
  connectTimeout: 45_000,
  // Sin compresión por mensaje: ahorra CPU (los mensajes son pequeños).
  perMessageDeflate: false,
  httpCompression: false,
})
@UseFilters(new WsExceptionFilter())
@UsePipes(new ValidationPipe({ whitelist: true }))
export class LiveGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  private readonly server: Namespace;

  private readonly logger = new Logger(LiveGateway.name);
  // Logs de diagnóstico de conexiones (desactivar con LOG_WS=0).
  private readonly debug = process.env.LOG_WS !== '0';
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });
  private statsTimer?: NodeJS.Timeout;
  private readonly pendingResults = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly config: ConfigService,
    private readonly presentationsService: PresentationsService,
    private readonly responsesService: ResponsesService,
    private readonly analyticsService: AnalyticsService,
    private readonly qaService: QaService,
  ) {}

  afterInit(namespace: Namespace) {
    // Errores del motor antes de que exista el socket (handshake, CORS, etc.).
    namespace.server.engine.on(
      'connection_error',
      (err: {
        code: number;
        message: string;
        context?: unknown;
        req?: { url?: string };
      }) =>
        this.logger.warn(
          `[ws] error de conexión del motor: code=${err.code} ${err.message} url=${err.req?.url ?? '-'} ${err.context ? JSON.stringify(err.context) : ''}`,
        ),
    );

    // Cada 60 s: conexiones abiertas, retraso del event loop y memoria.
    // Si el retraso es alto, el proceso se queda sin CPU (0.1) y los pings no
    // alcanzan a responderse: las conexiones se caen por "ping timeout".
    this.loopDelay.enable();
    this.statsTimer = setInterval(() => {
      const ms = (ns: number) => (ns / 1e6).toFixed(0);
      const mem = process.memoryUsage();
      this.logger.log(
        `[ws] estado: sockets=${namespace.sockets.size} event-loop p50=${ms(this.loopDelay.percentile(50))}ms p99=${ms(this.loopDelay.percentile(99))}ms max=${ms(this.loopDelay.max)}ms rss=${(mem.rss / 1048576).toFixed(0)}MB`,
      );
      this.loopDelay.reset();
    }, 60_000);
    this.statsTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.statsTimer);
    this.loopDelay.disable();
  }

  async handleConnection(client: LiveSocket) {
    const { code, role, adminKey } = client.handshake.auth as Record<
      string,
      string
    >;

    if (this.debug) {
      const ip =
        (
          client.handshake.headers['x-forwarded-for'] as string | undefined
        )?.split(',')[0] ?? client.handshake.address;
      const t0 = Date.now();
      this.logger.log(
        `[ws] + ${client.id} code=${code} role=${role} transport=${client.conn.transport.name} ip=${ip}`,
      );
      client.conn.once('upgrade', (t: { name: string }) =>
        this.logger.log(`[ws] ↑ ${client.id} transporte mejorado a ${t.name}`),
      );
      client.on('disconnect', (reason: string, description?: unknown) => {
        const desc =
          description instanceof Error
            ? description.message
            : description &&
                typeof description === 'object' &&
                'description' in description
              ? String((description as { description: unknown }).description)
              : '';
        this.logger.log(
          `[ws] - ${client.id} code=${code} role=${role} motivo=${reason}${desc ? ` (${desc})` : ''} duró=${((Date.now() - t0) / 1000).toFixed(0)}s`,
        );
      });
    }

    if (!code || !ROLES.includes(role as ClientRole)) {
      return this.reject(client, 'Missing or invalid code/role');
    }
    if (role === 'admin' && !resolveControlKey(this.config, adminKey)) {
      return this.reject(client, 'Invalid key');
    }

    const tConn = Date.now();
    try {
      const snapshot = await this.presentationsService.getSnapshot(code);
      const normalizedCode = snapshot.presentation.code;
      client.data = { code: normalizedCode, role: role as ClientRole };
      await client.join([
        room(normalizedCode),
        room(normalizedCode, role as ClientRole),
      ]);

      client.emit('presentation:snapshot', snapshot);
      client.emit('qa:update', await this.qaService.list(normalizedCode));
      this.broadcastParticipants(normalizedCode);
      if (
        role !== 'audience' ||
        snapshot.presentation.state.showResultsToAudience
      ) {
        await this.emitCurrentResults(normalizedCode, client);
      }
      const took = Date.now() - tConn;
      if (took > 2000) {
        this.logger.warn(
          `[ws] conexión ${client.id} tardó ${took}ms en recibir la presentación`,
        );
      }
    } catch (err) {
      // Solo "no existe" es definitivo; cualquier otro error (base de datos,
      // reinicio) es temporal y el cliente vuelve a intentar solo.
      if (err instanceof NotFoundException) {
        this.reject(client, `Presentation ${code} not found`);
      } else {
        this.logger.warn(`Connection for ${code} failed: ${String(err)}`);
        this.reject(client, 'Servidor no disponible, reintentando');
      }
    }
  }

  async handleDisconnect(client: LiveSocket) {
    if (client.data?.code) {
      this.broadcastParticipants(client.data.code);
    }
  }

  @SubscribeMessage('audience:answer')
  async onAnswer(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() dto: SubmitResponseDto,
  ) {
    await this.responsesService.submit(client.data.code, dto);
    return { ok: true };
  }

  @SubscribeMessage('audience:ask')
  async onAsk(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() dto: AskQuestionDto,
  ) {
    await this.qaService.ask(client.data.code, dto);
    return { ok: true };
  }

  // Ronda de preguntas: todos reciben la lista completa cuando cambia.
  @OnEvent(Events.QA_CHANGED)
  async onQaChanged({ code }: QaChangedEvent) {
    this.server
      .to(room(code))
      .emit('qa:update', await this.qaService.list(code));
  }

  @SubscribeMessage('admin:update-state')
  async onUpdateState(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() dto: UpdateStateDto,
  ) {
    this.assertAdmin(client);
    const presentation = await this.presentationsService.updateState(
      client.data.code,
      dto,
    );
    return presentation.state;
  }

  @SubscribeMessage('admin:next')
  async onNext(@ConnectedSocket() client: LiveSocket) {
    this.assertAdmin(client);
    return (await this.presentationsService.step(client.data.code, 1)).state;
  }

  @SubscribeMessage('admin:prev')
  async onPrev(@ConnectedSocket() client: LiveSocket) {
    this.assertAdmin(client);
    return (await this.presentationsService.step(client.data.code, -1)).state;
  }

  // State changes may come from REST or sockets; both emit this event.
  @OnEvent(Events.PRESENTATION_STATE_CHANGED)
  async onStateChanged({ code, state }: PresentationStateChangedEvent) {
    this.server.to(room(code)).emit('presentation:state', state);
    await this.emitCurrentResults(code);
  }

  // Debounced so a burst of votes produces a single aggregation per window.
  @OnEvent(Events.RESPONSE_SUBMITTED)
  onResponseSubmitted({ code, questionId }: ResponseSubmittedEvent) {
    this.analyticsService.invalidate(code, questionId);
    if (this.pendingResults.has(code)) return;
    this.pendingResults.set(
      code,
      setTimeout(() => {
        this.pendingResults.delete(code);
        this.emitCurrentResults(code).catch((err: unknown) =>
          this.logger.error(`Failed to broadcast results for ${code}`, err),
        );
      }, RESULTS_DEBOUNCE_MS),
    );
  }

  private async emitCurrentResults(code: string, target?: LiveSocket) {
    const { state } = await this.presentationsService.findByCode(code);
    if (!state.currentQuestionId) return;

    const results = await this.analyticsService.questionResults(
      code,
      state.currentQuestionId,
    );
    if (target) {
      target.emit('results:update', results);
      return;
    }

    const rooms = [room(code, 'screen'), room(code, 'admin')];
    if (state.showResultsToAudience) rooms.push(room(code, 'audience'));
    this.server.to(rooms).emit('results:update', results);
  }

  private readonly pendingParticipants = new Map<string, NodeJS.Timeout>();

  // Agrupa las conexiones/desconexiones en ráfaga en un solo aviso.
  private broadcastParticipants(code: string) {
    if (this.pendingParticipants.has(code)) return;
    this.pendingParticipants.set(
      code,
      setTimeout(() => {
        this.pendingParticipants.delete(code);
        // Tamaño de la sala en memoria: sin recorrer los sockets.
        const count =
          this.server.adapter.rooms.get(room(code, 'audience'))?.size ?? 0;
        this.server
          .to([room(code, 'screen'), room(code, 'admin')])
          .emit('participants:count', count);
      }, PARTICIPANTS_DEBOUNCE_MS),
    );
  }

  private assertAdmin(client: LiveSocket) {
    if (client.data.role !== 'admin') {
      throw new WsException('Admin role required');
    }
  }

  private reject(client: LiveSocket, message: string) {
    if (this.debug) {
      this.logger.warn(`[ws] ✕ ${client.id} rechazado: ${message}`);
    }
    client.emit('exception', { status: 'error', message });
    client.disconnect(true);
  }
}
