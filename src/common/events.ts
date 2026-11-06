import type { PresentationState } from '../presentations/schemas/presentation.schema';

export const Events = {
  PRESENTATION_STATE_CHANGED: 'presentation.state.changed',
  RESPONSE_SUBMITTED: 'response.submitted',
} as const;

export interface PresentationStateChangedEvent {
  code: string;
  state: PresentationState;
}

export interface ResponseSubmittedEvent {
  code: string;
  questionId: string;
}
