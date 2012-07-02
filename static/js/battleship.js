$(function(){
    var TILE_UNTOUCHED = -1,
        TILE_AIMED    = 0,
        TILE_MISSED   = 1,
        TILE_LOADING  = 2,
        TILE_HIT      = 3,
        TILE_DOWN     = 4,
        TILE_SHIP     = 5,
        STATE_CLASS   = {};

    STATE_CLASS[TILE_UNTOUCHED] = 'untouched';
    STATE_CLASS[TILE_AIMED] = 'aimed';
    STATE_CLASS[TILE_MISSED] = 'missed';
    STATE_CLASS[TILE_LOADING] = 'loading';
    STATE_CLASS[TILE_HIT] = 'hit';
    STATE_CLASS[TILE_DOWN] = 'down';
    STATE_CLASS[TILE_SHIP] = 'ship';

    /*
      MODELS
      -------------------------------------------------------------------------
     */
    var Tile = Backbone.Model.extend({
	defaults: function() {
	    return {
		state: TILE_UNTOUCHED,
		clickable: false
		// required attrs:
		// x -- row (from 1 to 10)
		// y -- column (from A to J)
	    };
	},

	initialize: function() {
	    _.bindAll(this, 'receiveShot', 'ackShot');
	    this.ioBind('receive_shot', window.io, this.receiveShot);
	    this.ioBind('ack_shot', window.io, this.ackShot);
	},

	coordinates: function() {
	    return [this.get('x'), this.get('y')];
	},

	isClickeable: function() {
	    return this.get('clickable') &&
		   (this.get('state') != TILE_UNTOUCHED ||
        	    this.get('state') != TILE_AIMED);
	},

	// socket.io listeners
	receiveShot: function() {
	    // This tile needs to be a Defense Tile.
	    // This function needs to return the status and a list
	    // with all the tiles affected.
	    var new_state;
	    if (this.get('state') == TILE_UNTOUCHED)
		new_state = TILE_MISSED;
	    else { // this tile is a ship
		new_state = TILE_HIT;
		// Now lets see if we took down a ship.
	    }
	    this.set({'state': new_state});
	    window.io.emit('ack shot', {
		'new_state': new_state,
		'tiles_hit': [this.coordinates()]
	    });

	    // Notify the user...
	    var text, cls = 'failure';
	    switch(new_state) {
	    case TILE_MISSED:
		cls  = 'success';
		text = 'Nothing happend!!';
		break;
	    case TILE_HIT:
		text = 'Sorry dude, you\'ve been hit...';
		break;
	    case TILE_DOWN:
		text = 'BOOM ' + this.repr() + '!!';
	    }
	    window.notifications.add({text: text, cls: cls});
	},

	ackShot: function(new_state) {
	    // This tile needs to be an Attack Tile.
	    this.set(new_state);

	    // Notify the user...
	    var text, cls = 'success';
	    switch(new_state.state) {
	    case TILE_MISSED:
		cls  = 'failure';
		text = 'Sorry dude, you hit water...';
		break;
	    case TILE_HIT:
		text = 'You hit a Ship!!';
		break;
	    case TILE_DOWN:
		text = 'BOOM ' + this.repr() + '!!';
	    }
	    window.notifications.add({text: text, cls: cls});
	},

	repr: function() {
	    return this.get('y') + '-' + this.get('x');
	}
    });


    var Board = Backbone.Model.extend({
	urlRoot: '/boards',

	defaults: function() {
	    return {active: false};
	},

	initialize: function() {
	    var self = this;
	    _.bindAll(this, 'activate', 'deactivate');
	    this.ioBind('activate', window.io, this.activate);
	    this.ioBind('deactivate', window.io, this.deactivate);
	},

	isActive: function() {
	    return this.get('active');
	},

	activate: function() {
	    this.set({active: true});
	    window.notifications.add({text: 'Your turn!'});
	},

	deactivate: function() {
	    this.set({active: false});
	    window.notifications.add({text: 'Wait for your opponent\'s move...'});
	}
    });


    /*
      COLLECTIONS
      -------------------------------------------------------------------------
     */
    var TileList = Backbone.Collection.extend({
	model: Tile,

	url: '/tiles',

	aimed: function() {
	    return this.filter(function(tile) { return tile.get('state') === TILE_AIMED });
	},

	getByPosition: function(row, column) {
	    return this.filter(function(tile) {
		return tile.get('x') == row && tile.get('y') == column;
	    })[0];
	},
    });

    /*
      VIEWS
      -------------------------------------------------------------------------
     */
    var TileView = Backbone.View.extend({
	tagName: 'td',

	events: {
	    'click': 'react'
	},

	initialize: function(attrs) {
	    this.board = attrs.board;
	    this.model.on('change', this.render, this);
	},

	react: function() {
	    if (!this.board.model.isActive()) return false;
	    // Delete aim from all other tiles
	    _.each(this.board.tiles.aimed(), function(tile) {
		if (tile !== this) tile.set('state', TILE_UNTOUCHED)
	    });
	    // Toggle state...
	    var currentState = this.model.get('state');
	    this.model.set('state', (currentState == TILE_UNTOUCHED ? TILE_AIMED : TILE_UNTOUCHED));
	},

	render: function() {
	    this.$el.removeClass().addClass(STATE_CLASS[this.model.get('state')]);
	    // var self = this;
	    // this.$el.removeClass().flip({
	    // 	direction: 'tb',
	    // 	onEnd: function() {
	    // 	    self.$el.addClass(STATE_CLASS[self.model.get('state')]);
	    // 	}
	    // });
	    return this;
	},
    });

    var BoardMixin  = {
	initialize: function() {
	    this.model = new Board({id: this.boardname});
	    this.table = this.$('table');
	    this.tiles.on('add', this.addTile, this);
	    this.model.on('change', this.setTurn, this);
	    this.render();
	},

	render: function() {
	    var column;
	    // Creates the 100 tiles
	    for (row = 1; row <= 10; row++) {
		this.currentRow = $('<tr class="row-' + row + '"></tr>').appendTo(this.table);
		for (c = 65; c < 75; c++) {
		    column = String.fromCharCode(c);
		    this.tiles.add({
			x: row,
			y: column,
			id: this.generateTileId(row, column)
		    });
		}
	    }
	},

	addTile: function(tile) {
	    var tileView = new TileView({model: tile, board: this});
	    this.currentRow.append(tileView.render(this).el);
	},

	generateTileId: function(row, column) {
            return this.boardname.charAt(0) + '-' + row + '-' + column;
	},

	setTurn: function() {
	    this.$el.removeClass();
	    if (this.model.isActive())
		this.$el.addClass('active animated tada');
	},
    };

    var AttackBoard = Backbone.View.extend({
	el: $('#board2'),
	boardname: 'attack',
	tiles: new TileList,

	events: {
	    'click td': 'alertShoot',
	},

	shoot: function() {
	    // Handle shoot
	    //this.tiles.aimed()[0].save();
	    var aimed_tile = this.tiles.aimed()[0];
	    aimed_tile.set({state: TILE_LOADING});
	    window.io.emit('user_shoots', aimed_tile.coordinates());
	},

	alertShoot: function() { window.notifications.renderShoot(); },
    });
    _.extend(AttackBoard.prototype, BoardMixin);

    var DefenseBoard = Backbone.View.extend({
	el: $('#board1'),
	boardname: 'defense',
	tiles: new TileList,

	loadShips: function() {
	    var direction   = '-',
	        row         = 0,
    	        column      = '-',
	        rowLimit    = 0,
	        columnLimit = 0;

	    // Ship #1, 2 tiles
	    while(direction != 'H' && direction != 'V')
		//direction = prompt('SHIP #1, 2 Tiles. Direction? [H|V]');
		direction = 'H';
	    rowLimit    = (direction == 'H' ? 10 : 10-1);
	    columnLimit = (direction == 'H' ? String.fromCharCode(74-1) : 'J');
	    while(row < 1 || row > rowLimit)
		//row = prompt('SHIP #1, 2 Tiles. Row? [1..' + rowLimit + ']');
		row = 2;
	    while(column < 'A' || column > columnLimit)
		//column = prompt('SHIP #1, 2 Tiles. Column? [A..' + columnLimit + ']');
		column = 'B';
	    this.tiles.getByPosition(row, column).set('state', TILE_SHIP);
	    if (direction == 'H') column = String.fromCharCode(column.charCodeAt()+1);
	    else row++;
	    this.tiles.getByPosition(row, column).set('state', TILE_SHIP);

	    direction = '-'; row = 0; column = '-';

	    // Ship #2 & #3, 3 tiles
	    for (ship = 2; ship < 4; ship++) {
		while(direction != 'H' && direction != 'V')
		    //direction = prompt('SHIP #' + ship + ', 3 Tiles. Direction? [H|V]');
		    direction = (ship == 2 ? 'H' : 'V');
		rowLimit    = (direction == 'H' ? 10 : 10-2);
		columnLimit = (direction == 'H' ? String.fromCharCode(74-2) : 'J');
		while(row < 1 || row > rowLimit)
		    //row = prompt('SHIP #' + ship + ', 3 Tiles. Row? [1..' + rowLimit + ']');
		    row = (ship == 2 ? 9 : 6);
		while(column < 'A' || column > columnLimit)
		    //column = prompt('SHIP #' + ship + ', 3 Tiles. Column? [A..' + columnLimit + ']');
		    column = (ship == 2 ? 'G' : 'J');
		this.tiles.getByPosition(row, column).set('state', TILE_SHIP);
		if (direction == 'H') column = column = String.fromCharCode(column.charCodeAt()+1);
		else row++;
		this.tiles.getByPosition(row, column).set('state', TILE_SHIP);
		if (direction == 'H') column = column = String.fromCharCode(column.charCodeAt()+1);
		else row++;
		this.tiles.getByPosition(row, column).set('state', TILE_SHIP);

		direction = '-'; row = 0; column = '-';
	    }

	    // Ship #4, 4 tiles
	    while(direction != 'H' && direction != 'V')
		//direction = prompt('SHIP #4, 4 Tiles. Direction? [H|V]');
		direction = 'V';
	    rowLimit    = (direction == 'H' ? 10 : 10-3);
	    columnLimit = (direction == 'H' ? String.fromCharCode(74-3) : 'J');
	    while(row < 1 || row > rowLimit)
		//row = prompt('SHIP #4, 4 Tiles. Row? [1..' + rowLimit + ']');
		row = 6;
	    while(column < 'A' || column > columnLimit)
		//column = prompt('SHIP #4, 4 Tiles. Column? [A..' + columnLimit + ']');
		column = 'B';
	    this.tiles.getByPosition(row, column).set('state', TILE_SHIP);
	    if (direction == 'H') column = String.fromCharCode(column.charCodeAt()+1);
	    else row++;
	    this.tiles.getByPosition(row, column).set('state', TILE_SHIP);
	    if (direction == 'H') column = String.fromCharCode(column.charCodeAt()+1);
	    else row++;
	    this.tiles.getByPosition(row, column).set('state', TILE_SHIP);
	    if (direction == 'H') column = String.fromCharCode(column.charCodeAt()+1);
	    else row++;
	    this.tiles.getByPosition(row, column).set('state', TILE_SHIP);

	    // Done. Now we notify the server.
	    window.io.emit('user is ready');
	},
    });
    _.extend(DefenseBoard.prototype, BoardMixin);

    // Init socket!
    window.io = io.connect();

    // Init Boards!
    window.Defense = new DefenseBoard;
    window.Attack  = new AttackBoard;

    // Simulate entering a room
    window.io.emit('user enters room', prompt('Username?'), 'room1');
    window.Defense.loadShips();
    //window.Attack.model.activate();
});
