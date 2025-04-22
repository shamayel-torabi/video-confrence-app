import { setupHeader } from "@/assets/js/components/header";

setupHeader(document.querySelector("#header")!, "ویدئو");


const frmJoin = document.getElementById('frmJoin');

frmJoin?.addEventListener('submit', (e: SubmitEvent) =>{
    e.preventDefault();
    const frmData = new FormData(e.currentTarget);
    const room = frmData.get('room');
    const username = frmData.get('username');

    if (room && username) {
        window.location.replace(`/produce.html?room=${room}&username=${username}`)
    }
});
