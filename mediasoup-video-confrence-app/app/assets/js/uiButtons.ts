const enableFeedBtn = document.getElementById('enable-feed') as HTMLButtonElement
const sendFeedBtn = document.getElementById('send-feed') as HTMLButtonElement
const hangUpBtn = document.getElementById('hang-up') as HTMLButtonElement
const muteBtn = document.getElementById('mute')  as HTMLButtonElement

const roomInfo = document.getElementById('room-info')
const control = document.getElementById('control-buttons')
const joinRoom = document.getElementById('join-room')
const remoteMediaMain = document.getElementById('remote-media')
const localMediaLeft = document.getElementById('local-video-left') as HTMLVideoElement
const localMediaRight = document.getElementById('local-video-right')  as HTMLVideoElement

export {
    enableFeedBtn,
    sendFeedBtn,
    hangUpBtn,
    roomInfo,
    control,
    joinRoom,
    localMediaLeft,
    localMediaRight,
    remoteMediaMain,
    muteBtn,
}