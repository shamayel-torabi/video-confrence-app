import { setupHeader } from "@js/components/header.js";
import { io } from "socket.io-client";

const socket = io("http://localhost:3031/ws");

setupHeader(document.querySelector("#header"), "ویدئو");

const frmJoin = document.getElementById("frmJoin");
const formSubmit = async (e) => {
  e.preventDefault();
  const frmData = new FormData(e.target);
  const roomName = frmData.get("room");
  const username = frmData.get("username");
  console.log("form submit", room, username);

  const { roomId } = await socket.emitWithAck("createRoom", roomName);

  if (roomId && username) {
    window.location.replace(
      `/produce.html?roomId=${roomId}&username=${username}`
    );
  }
};

frmJoin.addEventListener("submit", formSubmit);
