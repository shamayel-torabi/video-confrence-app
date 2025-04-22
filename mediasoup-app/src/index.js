import { setupHeader } from "@js/components/header.js";

setupHeader(document.querySelector("#header"), "ویدئو");


const frmJoin = document.getElementById('frmJoin');
const formSubmit = (e) => {
    e.preventDefault();
    const frmData = new FormData(e.target);
    const room = frmData.get('room');
    const username = frmData.get('username');
    console.log('form submit', room, username)

    if (room && username) {
        window.location.replace(`/produce.html?room=${room}&username=${username}`)
    }
}

frmJoin.addEventListener('submit', formSubmit);
