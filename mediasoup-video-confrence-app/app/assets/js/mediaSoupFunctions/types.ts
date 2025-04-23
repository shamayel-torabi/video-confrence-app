import { Consumer, RtpCapabilities, Transport } from "mediasoup-client/types";

export type ConsumeData = {
    routerRtpCapabilities: RtpCapabilities;
    audioPidsToCreate: string[];
    videoPidsToCreate: string[];
    associatedUserNames: string[];
    activeSpeakerList?: string[];
}

export type ConsumerType = {
  combinedStream: MediaStream;
  userName: string;
  consumerTransport: Transport;
  audioConsumer: Consumer;
  videoConsumer: Consumer;
}