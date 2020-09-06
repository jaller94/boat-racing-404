const display = document.getElementById('display');
let track;
let player;
let raceStartTime;

let pipes = [];

function addPipe(track, userId, name = 'You') {
    const root = document.createElement('p');
    const div = document.createElement('div');
    div.innerText = name;
    const progress = document.createElement('progress');
    progress.value = 0;
    progress.classList.add('pipe');
    root.append(div);
    root.append(progress);
    document.getElementById('pipes').append(root);
    const player = new Player(track, userId === undefined, userId);
    pipes.push({
        player,
        progress,
        root,
    });
    return player;
}

function removePipe(userId) {
    const pipe = pipes.find(p => p.player.id === userId);
    pipe.root.remove();
    const pos = pipes.findIndex(p => p === pipe);
    pipes.splice(pos, 1);
}

window.addEventListener('keypress', (event) => {
    if (event.key === 'r') {
        console.log('restart');
        socket.emit('restart');
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
        const time = Date.now() - raceStartTime;
        player.press(time);
    }
});

window.addEventListener('pointerdown', (event) => {
    const time = Date.now() - raceStartTime;
    player.press(time);
});

window.addEventListener('pointerup', (event) => {
    const time = Date.now() - raceStartTime;
    player.release(time);
});

window.addEventListener('keyup', (event) => {
    if (event.key === ' ') {
        const time = Date.now() - raceStartTime;
        player.release(time);
    }
});

setInterval(() => {
    if (raceStartTime) {
        const time = Date.now() - raceStartTime;
        const position = player.getPosition(time);
        if (player.finished) {
            display.innerHTML = `🏁 ${(player.finished/1000).toFixed(2)} seconds`
        } else {
            display.innerHTML = (track.isBump(position) ? '🟥' : '🟩');
        }
        pipes.forEach(pipe => {
            pipe.progress.value = pipe.player.getPosition(time);
        });
    }
}, 100);

class Track {
    constructor() {
        this.length = 378;
        this.bumps = [];
        for (let index = 1; index < 10; index++) {
            this.bumps.push({
                start: index * 100,
                length: 50,
            });
        }
    }

    isBump(position) {
        return this.bumps.some((bump) => (
            position >= bump.start && position <= bump.start + bump.length
        ));
    }
}

class Player {
    constructor(track, local=true, id=undefined) {
        this.id = id;
        this.track = track;
        this.changes = [];
        this.isDown = false;
        this.local = local;
        this.timeoutForNext = null;
        this.finished = null;
    }

    addMovementEvent(change) {
        if (this.finished) return;
        this.changes.push(change);
        if (this.local) {
            socket.emit('movement', change);

            this.setTimeoutForNext();
        }
    }

    setTimeoutForNext(time) {
        if (this.timeoutForNext) {
            clearTimeout(this.timeoutForNext);
        }
        const next = player.getNextChange(time || this.lastChange.time);
        const nextTime = player.whenWillIbethere(next.position)
        const deltaTime = nextTime - (Date.now() - raceStartTime);
        this.timeoutForNext = setTimeout(() => {
            if (next.type === 'bumpstart' && this.isDown) {
                this.addMovementEvent({
                    time: nextTime,
                    position: next.position,
                    speed: 0.003,
                });
            } else if (next.type === 'finish') {
                socket.emit('finish', nextTime);
                this.finished = nextTime;
            }
            if (next.type !== 'finish') {
                this.setTimeoutForNext(nextTime);
            }
        }, deltaTime);
    }

    press(timestamp) {
        if (this.isDown) return;
        this.isDown = true;
        const position = this.getPosition(timestamp);
        const change = {
            time: timestamp,
            position,
            speed: this.track.isBump(position) ? 0.005 : 0.04,
        };
        this.addMovementEvent(change);
    }

    release(timestamp) {
        if (!this.isDown) return;
        this.isDown = false;
        const position = this.getPosition(timestamp);
        const change = {
            time: timestamp,
            position,
            speed: 0.01,
        };
        this.addMovementEvent(change);
    }

    get lastChange() {
        if (this.changes.length === 0) {
            return {
                time: 0,
                position: 0,
                speed: 0.01,
            };
        }
        return this.changes[this.changes.length - 1];
    }

    whenWillIbethere(target) {
        const deltaLength = target - this.lastChange.position;
        const speed = this.lastChange.speed;
        return deltaLength / speed + this.lastChange.time;
    }

    getNextChange(timestamp) {
        const position = this.getPosition(timestamp);
        const finish = this.track.length;
        const nextBumpStart = (this.track.bumps.find((bump) => (
            position < bump.start
        )) || {}).start || finish + 1;
        const nextBumpEndBump = this.track.bumps.find((bump) => (
            position < bump.start + bump.length
        ));
        const nextBumpEnd = nextBumpEndBump ? nextBumpEndBump.start + nextBumpEndBump.length : finish + 1;
        if (nextBumpStart < finish || nextBumpEnd < finish) {
            if (nextBumpStart < nextBumpEnd) {
                return {
                    position: nextBumpStart,
                    type: 'bumpstart',
                };
            } else {
                return {
                    position: nextBumpEnd,
                    type: 'bumpend',
                };
            }
        }
        return {
            position: finish,
            type: 'finish',
        };
    }

    getPosition(timestamp) {
        const delta = timestamp - this.lastChange.time;
        return this.lastChange.position + delta * this.lastChange.speed;
    }
}

function setMessage(text) {
    document.getElementById('message').innerText = text;
}

function displayScore(text) {
    document.getElementById('score').innerText = text;
}

/**
 * Binde Socket.IO and button events
 */
function bind() {

    socket.on('start', (time) => {
        setMessage('Race started');
        raceStartTime = Date.now();
        pipes.forEach(pipe => {
            pipe.player.changes = [];
            pipe.player.finished = null;
            pipe.progress.max = track.length;
            pipe.progress.value = 0;
        });
    });

    socket.on('win', () => {
        points.win++;
        displayScore('You win!');
    });

    socket.on('lose', () => {
        points.lose++;
        displayScore('You lose!');
    });

    socket.on('draw', () => {
        points.draw++;
        displayScore('Draw!');
    });

    socket.on('userFinished', (msg) => {
        setMessage(msg);
    });

    socket.on('joined', (id, name) => {
        setMessage(`Player ${name} joined.`);
        addPipe(track, id, name);
    });

    socket.on('left', (id) => {
        const player = pipes.find(pipe => pipe.player.id === id).player;
        setMessage(`Player ${player.name} left.`);
        removePipe(id);
    });

    socket.on('movement', (id, movement) => {
        console.log(Date.now() - raceStartTime - movement.time);
        pipes.find(pipe => pipe.player.id === id).player.addMovementEvent(movement);
    });

    socket.on('connect', () => {
        setMessage('Connected.');
    });

    socket.on('disconnect', () => {
        setMessage('Connection lost!');
    });

    socket.on('error', () => {
        setMessage('Connection error!');
    });
}

const points = {
    win: 0,
    lose: 0,
    draw: 0,
};
raceStartTime = Date.now();
track = new Track();
player = addPipe(track);

/**
 * Client module init
 */
function init() {
    socket = io({ upgrade: false, transports: ['websocket'] });
    bind();
}

window.addEventListener('load', init, false);
