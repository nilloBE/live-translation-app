export type UiLanguage = "fr" | "nl" | "en";

export interface AudienceStrings {
  appName: string;
  chooseLanguage: string;
  chooseLanguageHint: string;
  connectToRoom: string;
  roomCodeLabel: string;
  roomCodePlaceholder: string;
  connect: string;
  changeLanguage: string;
  leaveRoom: string;
  connected: string;
  connecting: string;
  reconnecting: string;
  disconnected: string;
  connectionFailed: string;
  speakerLanguage: string;
  waitingForSpeaker: string;
  readIn: string;
  waitingForCaptions: string;
  targetUnavailable: (language: string) => string;
  recentCaptions: string;
  final: string;
  live: string;
  connectedViewers: (count: number) => string;
}

export const uiLanguages: Array<{ code: UiLanguage; label: string; targetCode: string }> = [
  { code: "fr", label: "Français", targetCode: "fr" },
  { code: "nl", label: "Nederlands", targetCode: "nl" },
  { code: "en", label: "English", targetCode: "en" },
];

export const strings: Record<UiLanguage, AudienceStrings> = {
  fr: {
    appName: "Sous-titres en direct",
    chooseLanguage: "Choisissez votre langue",
    chooseLanguageHint: "Cette langue règle l'interface. Vous pourrez choisir séparément la langue des transcriptions.",
    connectToRoom: "Rejoindre une salle",
    roomCodeLabel: "Code de salle",
    roomCodePlaceholder: "LIVE-ABCD",
    connect: "Se connecter",
    changeLanguage: "Changer de langue",
    leaveRoom: "Quitter la salle",
    connected: "Connecté",
    connecting: "Connexion",
    reconnecting: "Reconnexion",
    disconnected: "Déconnecté",
    connectionFailed: "Connexion impossible",
    speakerLanguage: "Langue de l'orateur",
    waitingForSpeaker: "En attente de l'orateur",
    readIn: "Lire en",
    waitingForCaptions: "En attente des sous-titres",
    targetUnavailable: (language) => `L'orateur ne diffuse pas ${language} pour le moment.`,
    recentCaptions: "Sous-titres récents",
    final: "Final",
    live: "Direct",
    connectedViewers: (count) => `${count} connecté${count === 1 ? "" : "s"}`,
  },
  nl: {
    appName: "Live ondertitels",
    chooseLanguage: "Kies je taal",
    chooseLanguageHint: "Deze taal bepaalt de interface. Je kiest de transcriptietaal later apart.",
    connectToRoom: "Ga naar een ruimte",
    roomCodeLabel: "Ruimtecode",
    roomCodePlaceholder: "LIVE-ABCD",
    connect: "Verbinden",
    changeLanguage: "Taal wijzigen",
    leaveRoom: "Ruimte verlaten",
    connected: "Verbonden",
    connecting: "Verbinden",
    reconnecting: "Opnieuw verbinden",
    disconnected: "Niet verbonden",
    connectionFailed: "Verbinding mislukt",
    speakerLanguage: "Taal van spreker",
    waitingForSpeaker: "Wachten op de spreker",
    readIn: "Lees in",
    waitingForCaptions: "Wachten op ondertitels",
    targetUnavailable: (language) => `De spreker zendt momenteel geen ${language} uit.`,
    recentCaptions: "Recente ondertitels",
    final: "Definitief",
    live: "Live",
    connectedViewers: (count) => `${count} verbonden`,
  },
  en: {
    appName: "Live captions",
    chooseLanguage: "Choose your language",
    chooseLanguageHint: "This sets the interface language. You can choose the transcription language separately.",
    connectToRoom: "Join a room",
    roomCodeLabel: "Room code",
    roomCodePlaceholder: "LIVE-ABCD",
    connect: "Connect",
    changeLanguage: "Change language",
    leaveRoom: "Leave room",
    connected: "Connected",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    disconnected: "Disconnected",
    connectionFailed: "Connection failed",
    speakerLanguage: "Speaker language",
    waitingForSpeaker: "Waiting for speaker",
    readIn: "Read in",
    waitingForCaptions: "Waiting for captions",
    targetUnavailable: (language) => `The speaker is not broadcasting ${language} right now.`,
    recentCaptions: "Recent captions",
    final: "Final",
    live: "Live",
    connectedViewers: (count) => `${count} connected`,
  },
};
