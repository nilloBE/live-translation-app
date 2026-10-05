import { englishTranscriptLabels, type TranscriptLabels } from "@live-translation/shared";

export type UiLanguage = "fr" | "nl" | "en";

export interface AudienceStrings extends TranscriptLabels {
  appName: string;
  help: string;
  closeHelp: string;
  downloadTranscript: string;
  chooseLanguage: string;
  chooseLanguageHint: string;
  connectToRoom: string;
  roomCodeLabel: string;
  roomCodePlaceholder: string;
  roomCodeHint: string;
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
  returnToLive: string;
  final: string;
  live: string;
  fontSize: string;
  increaseFont: string;
  decreaseFont: string;
  theme: string;
  systemTheme: string;
  lightTheme: string;
  darkTheme: string;
  connectedViewers: (count: number) => string;
  status: string;
}

export const uiLanguages: Array<{ code: UiLanguage; label: string; targetCode: string }> = [
  { code: "fr", label: "Français", targetCode: "fr" },
  { code: "nl", label: "Nederlands", targetCode: "nl" },
  { code: "en", label: "English", targetCode: "en" },
];

export const strings: Record<UiLanguage, AudienceStrings> = {
  fr: {
    appName: "Sous-titres en direct",
    help: "Aide",
    closeHelp: "Fermer l'aide",
    aiDisclaimer: "Transcription et traduction générées par l'intelligence artificielle (IA).",
    originalText: "Transcription originale",
    translatedText: "Traduction",
    downloadTranscript: "Télécharger la transcription",
    chooseLanguage: "Choisissez votre langue",
    chooseLanguageHint: "Cette langue règle l'interface. Vous pourrez choisir séparément la langue des transcriptions.",
    connectToRoom: "Rejoindre une salle",
    roomCodeLabel: "Code de salle",
    roomCodePlaceholder: "LIVE-ABCD",
    roomCodeHint: "Saisissez le code affiché par l'orateur.",
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
    returnToLive: "Revenir au direct",
    final: "Final",
    live: "Direct",
    fontSize: "Taille du texte",
    increaseFont: "Agrandir le texte",
    decreaseFont: "Réduire le texte",
    theme: "Thème",
    systemTheme: "Système",
    lightTheme: "Clair",
    darkTheme: "Sombre",
    connectedViewers: (count) => `${count} connecté${count === 1 ? "" : "s"}`,
    status: "État",
  },
  nl: {
    appName: "Live ondertitels",
    help: "Hulp",
    closeHelp: "Hulp sluiten",
    aiDisclaimer: "Transcriptie en vertaling gegenereerd door kunstmatige intelligentie (AI).",
    originalText: "Oorspronkelijke transcriptie",
    translatedText: "Vertaling",
    downloadTranscript: "Transcriptie downloaden",
    chooseLanguage: "Kies je taal",
    chooseLanguageHint: "Deze taal bepaalt de interface. Je kiest de transcriptietaal later apart.",
    connectToRoom: "Ga naar een ruimte",
    roomCodeLabel: "Ruimtecode",
    roomCodePlaceholder: "LIVE-ABCD",
    roomCodeHint: "Voer de code in die de spreker toont.",
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
    returnToLive: "Terug naar live",
    final: "Definitief",
    live: "Live",
    fontSize: "Tekstgrootte",
    increaseFont: "Tekst vergroten",
    decreaseFont: "Tekst verkleinen",
    theme: "Thema",
    systemTheme: "Systeem",
    lightTheme: "Licht",
    darkTheme: "Donker",
    connectedViewers: (count) => `${count} verbonden`,
    status: "Status",
  },
  en: {
    ...englishTranscriptLabels,
    appName: "Live captions",
    help: "Help",
    closeHelp: "Close help",
    downloadTranscript: "Download transcript",
    chooseLanguage: "Choose your language",
    chooseLanguageHint: "This sets the interface language. You can choose the transcription language separately.",
    connectToRoom: "Join a room",
    roomCodeLabel: "Room code",
    roomCodePlaceholder: "LIVE-ABCD",
    roomCodeHint: "Enter the code shown by the speaker.",
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
    returnToLive: "Return to live",
    final: "Final",
    live: "Live",
    fontSize: "Text size",
    increaseFont: "Increase text size",
    decreaseFont: "Decrease text size",
    theme: "Theme",
    systemTheme: "System",
    lightTheme: "Light",
    darkTheme: "Dark",
    connectedViewers: (count) => `${count} connected`,
    status: "Status",
  },
};
