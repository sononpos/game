/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , nib = require('nib')
  , sio = require('socket.io');

/**
 * App.
 */

var app = express.createServer();

/**
 * App configuration.
 */

app.configure(function () {
  app.use(stylus.middleware({ src: __dirname + '/public', compile: compile }));
  app.use(express.static(__dirname + '/public'));
  app.set('views', __dirname);
  app.set('view engine', 'jade');

  function compile (str, path) {
    return stylus(str)
      .set('filename', path)
      .use(nib());
  };
});

/**
 * App routes.
 */

app.get('/', function (req, res) {
  res.render('index', { layout: false });
});

/**
 * App listen.
 */

var port = process.env.PORT || 3000;
app.listen(port, function () {
  var addr = app.address();
  console.log('   app listening on http://' + addr.address + ':' + addr.port);
});

/**
 * Socket.IO server (single process only)
 */

var io = sio.listen(app)
  , nicknames = {};

  // ������ ���� Ű������ ����
  var socketRoom = {};

  // �� ��ü
  var gameInfos = {};

  // ��������
  var GameInfo = function(roomKey, players, turn, turnType, number1, operator, number2, winner) {
    this.roomKey = roomKey;
    this.players = players;
    this.turn = turn;
    this.turnType = turnType;
    this.number1 = number1;
    this.operator = operator;
    this.number2 = number2;
    this.winner = winner;
  };

  // �÷��̾� ��ü
  var Player = function(key, cards) {
    this.key = key;
    this.cards = cards;
  };

  // ī�� ��ü
  var Card = function(seq, type, value) {
    this.seq = seq;
    this.type = type;
    this.value = value;
  };

  io.sockets.on('connection', function (socket) {

  	// ������ �˸�
   	socket.emit('connected');

  	// ���ӽ���
  	socket.on('startGame', function(data) {

  		var rooms = io.sockets.manager.rooms;

  		for(var key in rooms) {

  			// ù���� Ű�� ���̴���
  			if(key == '') {
  				continue;
  			}

  			// �濡 �ִ� �ο��� 1�̸� ����
  			if(rooms[key].length == 1) {
  				var roomKey = key.replace('/', '');

          if(roomKey != socket.id) {
    				joinRoom(socket, roomKey);
    				return;
          }
  			}
  		}
  		// �������� �游���.
  		createRoom(socket);
  	});

    // ��������
  	socket.on('endGame', function(data) {
      var roomKey = socketRoom[socket.id];
      leaveRoom(roomKey);
  	});

    // ī�� ����
    socket.on('selectCard', function(data) {
      var roomKey = socketRoom[socket.id];

      // ���������� ������
      var gameInfo = gameInfos[roomKey];

      if(checkCard(socket, roomKey, gameInfo, data)) {

        // ���� ���������

        // ���� ����
        if(roomKey == socket.id) {
          gameInfo.turn = 2;
        } else {
          gameInfo.turn = 1;
        }

        // ī�忡 �°� �������� ����
        if(gameInfo.turnType == 1) {
          // ���ڳ������̰� �����ڰ� ��� ������ number1 ����
          if(gameInfo.operator == '?') {
            gameInfo.number1 = data.cardValue;
            gameInfo.turnType = 2;  // ��Ÿ�� ����
          } else {
            gameInfo.number2 = data.cardValue;
            gameInfo.turnType = 1;  // ��Ÿ�� ����
          }

        } else {
          // ������ �� ���ʸ� operator�� ����
          gameInfo.operator = data.cardValue;
          gameInfo.turnType = 1;  // ��Ÿ�� ����
        }

        // number2�� ä�������� ��������
        if(gameInfo.number2 != '?') {
          var resultValue, number1, number2;
          number1 = parseInt(gameInfo.number1);
          number2 = parseInt(gameInfo.number2);
          switch (gameInfo.operator) {
            case '+' : resultValue = number1 + number2; break;
            case '-' : resultValue = number1 - number2; break;
            case '*' : resultValue = number1 * number2; break;
            case '/' : resultValue = Math.floor(number1 / number2); break; // �Ҽ��� ����
            default : break;
          }

          // �÷��̾� ���� �ݿ�
          for(var i = 0; i < gameInfo.players.length; i++) {
            if(gameInfo.players[i].key == socket.id) {
              //gameInfo.players[i].score += resultValue;
              // ����� ���� ī�带 ����� �ش�.
              var nextSeq = parseInt(gameInfo.players[i].cards[gameInfo.players[i].cards.length - 1].seq) + 1;

              gameInfo.players[i].cards.push(new Card(nextSeq, 1, resultValue));
            }
          }

          // �ѹ�, ������ �ʱ�ȭ
          gameInfo.number1 = '?';
          gameInfo.operator = '?';
          gameInfo.number2 = '?';
        }

        // ������ ī�带 ����
        for(var i = 0; i < gameInfo.players.length; i++) {

          if(gameInfo.players[i].key == socket.id) {
            for(var j = 0; j < gameInfo.players[i].cards.length; j++) {
              if(gameInfo.players[i].cards[j].seq == data.cardSeq) {
                  // ������ �迭��Ҹ� �����Ѵ�!
                  gameInfo.players[i].cards.splice(j, 1);
              }
            }
          }
        }

        var player1Score;
        var player2Score;
        var player1End = false;
        var player2End = false;

        // ������ ī����(����, ������)�� ���, �ְ� �÷��̾��� ī�尡 1�徿 ���� �ִٸ� ���ڸ� ����
        if(gameInfo.number1 == '?' && gameInfo.operator == '?' && gameInfo.number2 == '?') {
          for(var i = 0; i < gameInfo.players.length; i++) {
            if(gameInfo.players[i].cards.length == 1) {

              if(gameInfo.players[i].key == roomKey) {
                player1Score = gameInfo.players[i].cards[0].value;
                player1End = true;
              } else {
                player2Score = gameInfo.players[i].cards[0].value;
                player2End = true;
              }
            }
          }
        }

        // ���ӳ������� ����ǥ��
        if(player1End && player2End) {
          if(player1Score > player2Score) {
            // �÷��̾�1 �¸�
            gameInfo.winner = 1;
          } else if(player1Score < player2Score) {
            // �÷��̾�2 �¸�
            gameInfo.winner = 2;
          } else {
            //���º�
            gameInfo.winner = 3;
          }
        }

        // ����� ���� ������ ����
        gameInfos[roomKey] = gameInfo;

        io.sockets.in(roomKey).emit('selectCardComplete', gameInfo);
      }
  	});

  });

  // ī�� ����
  function checkCard(socket, roomKey, gameInfo, data) {
    var validResult = true;

    // turn = 1�̸� �÷��̾� 1���� turnType = 1 �̸� ���ڸ� ������
    // �÷��̾� 1�� ���
    if(roomKey == socket.id) {

      // �ٸ� �÷��̾ ��������
      if(data.playerNumber != 1) {
        validResult = false;
      }
      // ���ʰ� �ƴ� ���
      if(gameInfo.turn != 1) {
        validResult = false;
      }
    } else {

      if(data.playerNumber != 2) {
        validResult = false;
      }

      if(gameInfo.turn != 2) {
        validResult = false;
      }
    }

    // �߸��� ī�� Ÿ�� ����������
    if(gameInfo.turnType != data.cardType) {
      validResult = false;
    }

    // �������� �ʴ� ī�带 ���� ���
    var existsCard = false;
    for(var i = 0; i < gameInfo.players.length; i++) {
      if(gameInfo.players[i].key == socket.id) {
        for(var j = 0; j < gameInfo.players[i].cards.length; j++) {
          if(gameInfo.players[i].cards[j].seq == data.cardSeq) {
            existsCard = true;
          }
        }
      }
    }

    if(!existsCard) {
      validResult = false;
    }

    // �ºΰ� ��������
    if(gameInfo.winner > 0) {
      validResult = false;
    }

    return validResult;
  }

  // �游���
  function createRoom(socket) {
    socket.join(socket.id);
  	socketRoom[socket.id] = socket.id;
  	socket.emit('createRoom');
  }

  // �涰����
  function leaveRoom(roomKey) {

    io.sockets.in(roomKey).emit('leaveRoom');

    var clients = io.sockets.clients(roomKey);

    for (var i = 0; i < clients.length; i++) {
      clients[i].leave(roomKey);
    }
  }

  // �� ����
  function joinRoom(socket, roomKey) {

    // �濡 ����
    socket.join(roomKey);
    socketRoom[socket.id] = roomKey;

    // �÷��̾� ����
    var player = [];

    // ī����� ������
    //Min, Max, Choice
    var card = randomBackground(1, 10, 5);

    var clients = io.sockets.clients(roomKey);

    for (var i = 0; i < clients.length; i++) {
        player.push(new Player(clients[i].id, createCard(card)));
    }

    var gameInfo = new GameInfo(roomKey, player, 1, 1, '?', '?', '?', 0);
    gameInfos[roomKey] = gameInfo;

    io.sockets.in(roomKey).emit('joinRoom', gameInfo);
  }

  // ī�� ����
  function createCard(card) {

    /* type 1 : ���� 2 : ������ */
    var cards = [];

    // ���� 5�� �Է�
    for (var i = 0; i < card.length; i++) {
      cards.push(new Card(i+1, 1, card[i]));
    }

    cards.push(new Card(6, 2, '+'));
    cards.push(new Card(7, 2, '-'));
    cards.push(new Card(8, 2, '*'));
    cards.push(new Card(9, 2, '/'));

    return cards;
  }

  // �ߺ� ���� ���� �����
  function randomBackground(min, max, choice) {

      var bgArray = [];
      var bgResult = [];
      var bgNum;

      for (var i = min; i <= max; i++) {
          bgArray.push(i);
      }

      for (var i = 0; i < choice; i++) {
         bgNum = Math.floor(Math.random() * bgArray.length);
         bgResult.push(bgArray[bgNum]); // �������� ���õ� ���� ������� bgReult�� ����
         bgArray.splice(bgNum, 1);    // ���õ� ���� bgArray���� ����, �ߺ� ���� ����
      }

      return bgResult;
  }
