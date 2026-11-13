import type { PresentationState } from '../presentations/schemas/presentation.schema';

export const Events = {
  PRESENTATION_STATE_CHANGED: 'presentation.state.changed',
  RESPONSE_SUBMITTED: 'response.submitted',
  QA_CHANGED: 'qa.changed',
} as const;

export interface QaChangedEvent {
  code: string;
}

export interface PresentationStateChangedEvent {
  code: string;
  state: PresentationState;
}

export interface ResponseSubmittedEvent {
  code: string;
  questionId: string;
}
