"use strict";
/**
 * Find opponent for a user
 * @param {User} user
 */
function findGame(user) {
	game.addUser(user);
	user.game = game;
}

function pickRandom(array) {
	return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min) + min);
}

function randomName() {
	const name = pickRandom('Paprika,Zucchini,Tomate,Zwiebel,Lauch,Aubergine,Avocado,Orange,Apfel,Birne,Erdbere,Heidelbeere,Blaubeere,Kürbis,Kartoffel,Knoblauch,Gurke'.split(','));
	return `${name} ${randomInt(1000, 9999)}`;
}

class Game {
	constructor() {
		this.users = [];
	}

	addUser(newUser) {
		this.users.forEach((user) => {
			newUser.socket.emit('joined', user.id, user.name);
			user.socket.emit('joined', newUser.id, newUser.name);
		});
		this.users.push(newUser);
	}

	removeUser(user) {
		const pos = this.users.findIndex(u => u === user);
		this.users.splice(pos, 1);
		this.users.forEach(u => {
			u.socket.emit('left', user.id);
		});
	}

	populateMovement(user, movement) {
		console.log(movement);
		this.users.filter(u => u.id !== user.id).forEach((u) => {
			u.socket.emit('movement', user.id, movement);
		});
	}

	start() {
		const time = Date.now();
		this.users.forEach((user) => {
			user.start(time);
		});
	}

	end() {
		this.start();
	}
}

class User {

	/**
	 * @param {Socket} socket
	 */
	constructor(socket) {
		this.socket = socket;
		this.id = socket.id;
		this.game = null;
		this.name = randomName();
		this.movements = [];
	}

	addMovementEvent(event) {
		this.movements.push(event);
		this.game.populateMovement(this, event);
	}

	start(time) {
		this.socket.emit("start", time);
	}

	/**
	 * Terminate game
	 */
	end() {
		this.socket.emit("end");
	}

	/**
	 * Trigger win event
	 */
	win() {
		this.socket.emit("win");
	}

	/**
	 * Trigger lose event
	 */
	lose() {
		this.socket.emit("lose");
	}

	/**
	 * Trigger draw event
	 */
	draw() {
		this.socket.emit("draw");
	}

}

/**
 * Socket.IO on connect event
 * @param {Socket} socket
 */
module.exports = {

	io: (socket) => {
		const user = new User(socket);
		findGame(user);

		socket.on("disconnect", () => {
			game.removeUser(user);
			console.log("Disconnected: " + socket.id);
		});

		socket.on("restart", () => {
			console.log("Restarted: " + socket.id);
			user.game.start();
		});

		socket.on("movement", (event) => {
			console.log("Movement: " + socket.id);
			user.addMovementEvent(event);
			if (event.position >= 1000) {
				user.game.end(user);
			}
		});

		console.log("Connected: " + socket.id);
	},

	stat: (req, res) => {
		storage.get('games', 0).then(games => {
			res.send(`<h1>Games played: ${games}</h1>`);
		});
	}

};

const game = new Game();
