//import { setupHeader } from "@/assets/js/components/header";
import { io } from "socket.io-client";

const socket = io("/ws");

//setupHeader(document.querySelector("#header")!, "ویدئو");

const frmJoin = document.getElementById("frmJoin") as HTMLFormElement;

const formSubmit = async (e) => {
  e.preventDefault();
  const frmData = new FormData(e.target);
  const roomName = frmData.get("room");
  const username = frmData.get("username");

  const { roomId } = await socket.emitWithAck("createRoom", roomName);

  if (roomId && username) {
    window.location.replace(
      `/produce.html?roomId=${roomId}&username=${username}`
    );
  }
};

frmJoin.addEventListener("submit", formSubmit);
