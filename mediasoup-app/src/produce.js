import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import buttons from "@js/uiButtons";
import createProducerTransport from "@js/mediaSoupFunctions/createProducerTransport";
import createProducer from "@js/mediaSoupFunctions/createProducer";
import requestTransportToConsume from "@js/mediaSoupFunctions/requestTransportToConsume";
import { setupHeader } from "@js/components/header.js";

let device = null;
let localStream = null;
let producerTransport = null;
let videoProducer = null;
let audioProducer = null; //THIS client's producer
let consumers = {}; //key off the audioPid

setupHeader(document.querySelector("#header"), "ویدئو");

const socket= io("http://localhost:3031/ws");

socket.on("connectionSuccess", (data) => {
  console.log(`Connected socketId: ${data.socketId}`);
});

socket.on("updateActiveSpeakers", async (newListOfActives) => {
  // console.log("updateActiveSpeakers")
  // console.log(newListOfActives)
  // an array of the most recent 5 dominant speakers. Just grab the 1st
  // and put it in the slot. Move everything else down
  // consumers is an {} with key of audioId, value of combined feed
  console.log('updateActiveSpeakers:', newListOfActives);
  let slot = 0;
  // remove all videos from video Els
  const remoteEls = document.getElementsByClassName("remote-video");
  for (let el of remoteEls) {
    el.srcObject = null; //clear out the <video>
  }
  newListOfActives.forEach((aid) => {
    if (aid !== audioProducer?.id) {
      // do not show THIS client in a video tag, other than local
      // put this video in the next available slot
      const remoteVideo = document.getElementById(`remote-video-${slot}`);
      const remoteVideoUserName = document.getElementById(`username-${slot}`);
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

    if(joinRoomResp.error){
      alert(joinRoomResp.error)
      return;
    }
    // console.log(joinRoomResp)
    device = new Device();
    await device.load({
      routerRtpCapabilities: joinRoomResp.routerRtpCapabilities,
    });
    // console.log(device)
    console.log('joinRoomResp:', joinRoomResp);
    // joinRoomResp contains arrays for:
    // audioPidsToCreate
    // mapped to videoPidsToCreate
    // mapped to usernames
    //These arrays, may be empty... they may have a max of 5 indicies
    requestTransportToConsume(joinRoomResp, socket, device, consumers);
    ``
    buttons.enableFeed.disabled = false;
    buttons.sendFeed.disabled = true;
    buttons.muteBtn.disabled = true;    
  }
};

const enableFeed = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  buttons.localMediaLeft.srcObject = localStream;
  buttons.enableFeed.disabled = true;
  buttons.sendFeed.disabled = false;
  buttons.muteBtn.disabled = false;
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
  buttons.hangUp.disabled = false;
};

const muteAudio = () => {
  // mute at the producer level, to keep the transport, and all
  // other mechanism in place
  if (audioProducer.paused) {
    // currently paused. User wants to unpause
    audioProducer.resume();
    buttons.muteBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-off-icon lucide-mic-off">
      <line x1="2" x2="22" y1="2" y2="22"/>
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
      <path d="M5 10v2a7 7 0 0 0 12 5"/>
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>
    `;
    buttons.muteBtn.classList.add("btn-success"); //turn it green
    buttons.muteBtn.classList.remove("btn-danger"); //remove the red
    // unpause on the server
    socket.emit("audioChange", "unmute");
  } else {
    //currently on, user wnats to pause
    audioProducer.pause();
    buttons.muteBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-icon lucide-mic">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
      </svg>

    `;
    buttons.muteBtn.classList.remove("btn-success"); //turn it green
    buttons.muteBtn.classList.add("btn-danger"); //remove the red
    socket.emit("audioChange", "mute");
  }
};

window.addEventListener("load", joinRoom);
buttons.enableFeed.addEventListener("click", enableFeed);
buttons.sendFeed.addEventListener("click", sendFeed);
buttons.muteBtn.addEventListener("click", muteAudio);
