// Tipos mínimos para la Web Speech API (SpeechRecognition), que TypeScript
// no incluye por defecto en el DOM lib. Solo lo que usamos en JarvisCore.
export interface SpeechRecognitionResultItem {
  transcript: string;
}
export interface SpeechRecognitionResultList {
  [index: number]: { [index: number]: SpeechRecognitionResultItem };
}
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
export interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}
