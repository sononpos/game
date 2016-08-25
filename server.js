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

  // 생성된 방을 키값으로 관리
  var socketRoom = {};

  // 방 객체
  var gameInfos = {};

  // 게임정보
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

  // 플레이어 객체
  var Player = function(key, cards) {
    this.key = key;
    this.cards = cards;
  };

  // 카드 객체
  var Card = function(seq, type, value) {
    this.seq = seq;
    this.type = type;
    this.value = value;
  };

  io.sockets.on('connection', function (socket) {

  	// 접속을 알림
   	socket.emit('connected');

  	// 게임시작
  	socket.on('startGame', function(data) {

  		var rooms = io.sockets.manager.rooms;

  		for(var key in rooms) {

  			// 첫번재 키는 빈값이더라
  			if(key == '') {
  				continue;
  			}

  			// 방에 있는 인원이 1이면 입장
  			if(rooms[key].length == 1) {
  				var roomKey = key.replace('/', '');

          if(roomKey != socket.id) {
    				joinRoom(socket, roomKey);
    				return;
          }
  			}
  		}
  		// 빈방없으면 방만든다.
  		createRoom(socket);
  	});

    // 게임종료
  	socket.on('endGame', function(data) {
      var roomKey = socketRoom[socket.id];
      leaveRoom(roomKey);
  	});

    // 카드 선택
    socket.on('selectCard', function(data) {
      var roomKey = socketRoom[socket.id];

      // 게임정보를 가져와
      var gameInfo = gameInfos[roomKey];

      if(checkCard(socket, roomKey, gameInfo, data)) {

        // 검증 통과했으면

        // 턴을 변경
        if(roomKey == socket.id) {
          gameInfo.turn = 2;
        } else {
          gameInfo.turn = 1;
        }

        // 카드에 맞게 게임정보 셋팅
        if(gameInfo.turnType == 1) {
          // 숫자낼차례이고 연산자가 비어 있으면 number1 셋팅
          if(gameInfo.operator == '?') {
            gameInfo.number1 = data.cardValue;
            gameInfo.turnType = 2;  // 턴타입 변경
          } else {
            gameInfo.number2 = data.cardValue;
            gameInfo.turnType = 1;  // 턴타입 변경
          }

        } else {
          // 연산자 낼 차례면 operator에 셋팅
          gameInfo.operator = data.cardValue;
          gameInfo.turnType = 1;  // 턴타입 변경
        }

        // number2가 채워졌으니 정산하자
        if(gameInfo.number2 != '?') {
          var resultValue, number1, number2;
          number1 = parseInt(gameInfo.number1);
          number2 = parseInt(gameInfo.number2);
          switch (gameInfo.operator) {
            case '+' : resultValue = number1 + number2; break;
            case '-' : resultValue = number1 - number2; break;
            case '*' : resultValue = number1 * number2; break;
            case '/' : resultValue = Math.floor(number1 / number2); break; // 소수점 버림
            default : break;
          }

          // 플레이어 점수 반영
          for(var i = 0; i < gameInfo.players.length; i++) {
            if(gameInfo.players[i].key == socket.id) {
              //gameInfo.players[i].score += resultValue;
              // 결과로 나온 카드를 만들어 준다.
              var nextSeq = parseInt(gameInfo.players[i].cards[gameInfo.players[i].cards.length - 1].seq) + 1;

              gameInfo.players[i].cards.push(new Card(nextSeq, 1, resultValue));
            }
          }

          // 넘버, 연산자 초기화
          gameInfo.number1 = '?';
          gameInfo.operator = '?';
          gameInfo.number2 = '?';
        }

        // 선택한 카드를 삭제
        for(var i = 0; i < gameInfo.players.length; i++) {

          if(gameInfo.players[i].key == socket.id) {
            for(var j = 0; j < gameInfo.players[i].cards.length; j++) {
              if(gameInfo.players[i].cards[j].seq == data.cardSeq) {
                  // 선택한 배열요소를 삭제한다!
                  gameInfo.players[i].cards.splice(j, 1);
              }
            }
          }
        }

        var player1Score;
        var player2Score;
        var player1End = false;
        var player2End = false;

        // 제출한 카드목록(숫자, 연산자)이 비어, 있고 플레이어의 카드가 1장씩 남아 있다면 승자를 선택
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

        // 게임끝났으면 승자표시
        if(player1End && player2End) {
          if(player1Score > player2Score) {
            // 플레이어1 승리
            gameInfo.winner = 1;
          } else if(player1Score < player2Score) {
            // 플레이어2 승리
            gameInfo.winner = 2;
          } else {
            //무승부
            gameInfo.winner = 3;
          }
        }

        // 변경된 게임 정보를 저장
        gameInfos[roomKey] = gameInfo;

        io.sockets.in(roomKey).emit('selectCardComplete', gameInfo);
      }
  	});

  });

  // 카드 검증
  function checkCard(socket, roomKey, gameInfo, data) {
    var validResult = true;

    // turn = 1이면 플레이어 1차례 turnType = 1 이면 숫자를 낼차례
    // 플레이어 1인 경우
    if(roomKey == socket.id) {

      // 다른 플레이어꺼 눌렀을때
      if(data.playerNumber != 1) {
        validResult = false;
      }
      // 차례가 아닌 경우
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

    // 잘못된 카드 타입 선택했을때
    if(gameInfo.turnType != data.cardType) {
      validResult = false;
    }

    // 존재하지 않는 카드를 냈을 경우
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

    // 승부가 끝났을때
    if(gameInfo.winner > 0) {
      validResult = false;
    }

    return validResult;
  }

  // 방만들기
  function createRoom(socket) {
    socket.join(socket.id);
  	socketRoom[socket.id] = socket.id;
  	socket.emit('createRoom');
  }

  // 방떠나기
  function leaveRoom(roomKey) {

    io.sockets.in(roomKey).emit('leaveRoom');

    var clients = io.sockets.clients(roomKey);

    for (var i = 0; i < clients.length; i++) {
      clients[i].leave(roomKey);
    }
  }

  // 방 들어가기
  function joinRoom(socket, roomKey) {

    // 방에 조인
    socket.join(roomKey);
    socketRoom[socket.id] = roomKey;

    // 플레이어 생성
    var player = [];

    // 카드숫자 생성기
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

  // 카드 생성
  function createCard(card) {

    /* type 1 : 숫자 2 : 연산자 */
    var cards = [];

    // 숫자 5개 입력
    for (var i = 0; i < card.length; i++) {
      cards.push(new Card(i+1, 1, card[i]));
    }

    cards.push(new Card(6, 2, '+'));
    cards.push(new Card(7, 2, '-'));
    cards.push(new Card(8, 2, '*'));
    cards.push(new Card(9, 2, '/'));

    return cards;
  }

  // 중복 없는 랜덤 만들기
  function randomBackground(min, max, choice) {

      var bgArray = [];
      var bgResult = [];
      var bgNum;

      for (var i = min; i <= max; i++) {
          bgArray.push(i);
      }

      for (var i = 0; i < choice; i++) {
         bgNum = Math.floor(Math.random() * bgArray.length);
         bgResult.push(bgArray[bgNum]); // 랜덤으로 선택된 숫자 순서대로 bgReult에 저장
         bgArray.splice(bgNum, 1);    // 선택된 숫자 bgArray에서 삭제, 중복 선택 방지
      }

      return bgResult;
  }
