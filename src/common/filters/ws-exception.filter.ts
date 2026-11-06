import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

// Without this, HttpExceptions thrown by shared services reach socket clients
// as a generic "Internal server error".
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      return super.catch(new WsException(exception.getResponse()), host);
    }
    return super.catch(exception, host);
  }
}
