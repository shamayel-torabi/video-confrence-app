import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import createProducerTransport from "@/assets/js/mediaSoupFunctions/createProducerTransport";
import createProducer from "@/assets/js/mediaSoupFunctions/createProducer";
import requestTransportToConsume from "@/assets/js/mediaSoupFunctions/requestTransportToConsume";
import { Producer, Transport } from "mediasoup-client/types";
import {
  enableFeedBtn,
  hangUpBtn,
  localMediaLeft,
  muteBtn,
  sendFeedBtn,
} from "./assets/js/uiButtons";
import { ConsumerType } from "@/assets/js/mediaSoupFunctions/types";
//import { setupHeader } from "@/assets/js/components/header";

let device: Device;
let localStream: MediaStream;
let producerTransport: Transport;
let videoProducer: Producer;
let audioProducer: Producer; //THIS client's producer
let consumers: Record<string, ConsumerType> = {}; //key off the audioPid

//setupHeader(document.querySelector("#header")!, "ویدئو");

const socket = io("/ws");

socket.on("connectionSuccess", (data) => {
  console.log(`Connected socketId: ${data.socketId}`);
});

socket.on("updateActiveSpeakers", async (newListOfActives: string[]) => {
  // console.log("updateActiveSpeakers")
  // console.log(newListOfActives)
  // an array of the most recent 5 dominant speakers. Just grab the 1st
  // and put it in the slot. Move everything else down
  // consumers is an {} with key of audioId, value of combined feed
  console.log("updateActiveSpeakers:", newListOfActives);
  let slot = 0;
  // remove all videos from video Els
  const remoteEls = document.getElementsByClassName(
    "remote-video"
  ) as HTMLCollectionOf<HTMLVideoElement>;
  for (let el of remoteEls) {
    el.srcObject = null; //clear out the <video>
  }
  newListOfActives.forEach((aid) => {
    if (aid !== audioProducer?.id) {
      // do not show THIS client in a video tag, other than local
      // put this video in the next available slot
      const remoteVideo = document.getElementById(
        `remote-video-${slot}`
      ) as HTMLVideoElement;
      const remoteVideoUserName = document.getElementById(
        `username-${slot}`
      ) as HTMLDivElement;
      const consumerForThisSlot = consumers[aid];
      remoteVideo.srcObject = consumerForThisSlot?.combinedStream;
      remoteVideoUserName.innerHTML = consumerForThisSlot?.userName;
      slot++; //for the next
    }
  });
});

socket.on("newProducersToConsume", (consumeData) => {
  // console.log("newProducersToConsume")
  // console.log(consumeData)
  requestTransportToConsume(consumeData, socket, device, consumers);
});

const joinRoom = async () => {
  const urlParams = new URLSearchParams(window.location.search);

  const userName = urlParams.get("username");
  const roomId = urlParams.get("roomId");

  if (userName && roomId) {
    const joinRoomResp = await socket.emitWithAck("joinRoom", {
      userName,
      roomId,
    });

    if (joinRoomResp.error) {
      alert(joinRoomResp.error);
      return;
    }
    // console.log(joinRoomResp)
    device = new Device();
    await device.load({
      routerRtpCapabilities: joinRoomResp.routerRtpCapabilities,
    });
    // console.log(device)
    console.log("joinRoomResp:", joinRoomResp);
    // joinRoomResp contains arrays for:
    // audioPidsToCreate
    // mapped to videoPidsToCreate
    // mapped to usernames
    //These arrays, may be empty... they may have a max of 5 indicies
    requestTransportToConsume(joinRoomResp, socket, device, consumers);

    enableFeedBtn.disabled = false;
    enableFeedBtn.classList.add('enable');

    sendFeedBtn.disabled = true;
    sendFeedBtn.classList.add('disabled');

    muteBtn.disabled = true;
    muteBtn.classList.add('disabled');

    hangUpBtn.disabled = true;
    hangUpBtn.classList.add('disabled');
  }
};

const enableFeed = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  localMediaLeft.srcObject = localStream;

  enableFeedBtn.disabled = true;
  enableFeedBtn.classList.remove('enable');
  enableFeedBtn.classList.add('disabled')

  sendFeedBtn.disabled = false;
  sendFeedBtn.classList.add('enable');
  sendFeedBtn.classList.remove('disabled');
};

const sendFeed = async () => {
  //create a transport for THIS client's upstream
  // it will handle both audio and video producers
  producerTransport = await createProducerTransport(socket, device);
  // console.log("Have producer transport. Time to produce!")
  // Create our producers
  const producers = await createProducer(localStream, producerTransport);
  audioProducer = producers.audioProducer;
  videoProducer = producers.videoProducer;
  //console.log(producers);

  sendFeedBtn.disabled = true;
  sendFeedBtn.classList.remove('enable');
  sendFeedBtn.classList.add('disabled');

  muteBtn.disabled = false;
  muteBtn.classList.add('enable');
  muteBtn.classList.remove('disabled');

  hangUpBtn.disabled = false;
  hangUpBtn.classList.add('enable');
  hangUpBtn.classList.remove('disabled');
};

const muteAudio = () => {
  // mute at the producer level, to keep the transport, and all
  // other mechanism in place
  if (audioProducer.paused) {
    // currently paused. User wants to unpause
    audioProducer.resume();
    muteBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-off-icon lucide-mic-off">
      <line x1="2" x2="22" y1="2" y2="22"/>
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
      <path d="M5 10v2a7 7 0 0 0 12 5"/>
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>
    `;
    // unpause on the server
    socket.emit("audioChange", "unmute");
  } else {
    //currently on, user wnats to pause
    audioProducer.pause();
    muteBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-icon lucide-mic">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>

    `;
    socket.emit("audioChange", "mute");
  }
};

const hangUp = async() =>{

}

window.addEventListener("load", joinRoom);
enableFeedBtn.addEventListener("click", enableFeed);
sendFeedBtn.addEventListener("click", sendFeed);
muteBtn.addEventListener("click", muteAudio);
hangUpBtn.addEventListener("click", hangUp)
