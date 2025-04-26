import {
  Consumer,
  DtlsParameters,
  IceCandidate,
  IceParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  WebRtcTransport,
} from "mediasoup/types";

export type Message = {
  id: string;
  text: string;
  userName: string;
  date: string;
};

export type MediaConsumer = {
  combinedStream: MediaStream;
  userName: string;
  consumerTransport: WebRtcTransport;
  audioConsumer: Consumer;
  videoConsumer: Consumer;
};

export type ConsumeData = {
  routerRtpCapabilities: RtpCapabilities;
  audioPidsToCreate: string[];
  videoPidsToCreate: string[];
  associatedUserNames: string[];
  activeSpeakerList?: string[];
};

export type DownstreamTransportType = {
  transport: WebRtcTransport;
  associatedVideoPid: string;
  associatedAudioPid: string;
  audio?: Consumer;
  video?: Consumer;
};

export type ClientTransportOptions = {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
};

export type ClientParamsType = {
  producerId: string;
  id: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
};

export type RoomType = {
  roomId: string;
  roomName: string;
};
