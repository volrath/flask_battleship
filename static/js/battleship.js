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

	isClickeable: function() {
	    return this.get('clickable') &&
		   (this.get('state') != TILE_UNTOUCHED ||
        	    this.get('state') != TILE_AIMED);
	},
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
	    if (!this.model.isClickeable()) return false;
	    // Delete aim from all other tiles
	    _.each(this.board.tiles.aimed(), function(tile) {
		if (tile !== this) tile.set('state', TILE_UNTOUCHED)
	    });
	    // Toggle state...
	    var currentState = this.model.get('state');
	    this.model.set('state', (currentState == TILE_UNTOUCHED ? TILE_AIMED : TILE_UNTOUCHED));
	},

	render: function() {
	    //this.$el.attr('id', this.generateId(board));
	    this.$el.removeClass().addClass(STATE_CLASS[this.model.get('state')]);
	    if (!this.model.isClickeable()) this.$el.addClass('unclickable');
	    return this;
	},
    });

    var BoardMixin  = {
	initialize: function() {
	    this.table = this.$('table');
	    this.tiles.on('add', this.addTile, this);
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

	isActive: function() {
	    return this.$el.hasClass('active');
	},

	generateTileId: function(row, column) {
            return this.boardname.charAt(0) + '-' + row + '-' + column;
	},
    };

    var AttackBoard = Backbone.View.extend({
	el: $('#board2'),
	boardname: 'attack',
	tiles: new TileList,

	events: {
	    'click td': 'alertShoot',
	},

	activate: function() {
	    // Handles a new turn.
	    this.$el.addClass('active attack');
	    this.tiles.each(function(tile) { tile.set('clickable', true) });
	    Notifications.aim();
	},

	deactivate: function() {
	    this.$el.removeClass('active attack');
	    this.tiles.each(function(tile) { tile.set('clickable', false) });
	}, 

	shoot: function() {
	    // Handle shoot
	    this.tiles.aimed()[0].save();
	    // ...
	    this.deactivate();
	},

	alertShoot: function() { Notifications.shoot(); },
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

	    // Done. Now the attack!
	    Attack.activate();
	},
    });
    _.extend(DefenseBoard.prototype, BoardMixin);

    var NotificationPanel = Backbone.View.extend({
	el: $('#notification'),

	events: {
	    'click #shoot':   'boardShoot',
	    'click #restart': 'restart',
	},

	shoot: function() {
	    if (this.$el.hasClass('shoot')) return;
	    return this.setMessage('<div id="shoot">SHOOT!</div>', 'shoot');
	},

	aim: function() {
	    return this.setMessage('Your move! aim your target.', 'info');
	},

	wait: function() {
	    return this.setMessage('Wait for your opponent\'s move.', 'info');
	},

	won: function() {
	    return this.setMessage('YOU WON! =)<br /><span id="restart">Restart</span>', 'success');
	},

	lose: function() {
	    return this.setMessage('You Lose =(<br /><span id="restart">Restart</span>', 'failure');
	},

	hide: function() {
	    this.$el.fadeOut('slow', function() {
		$(this).empty().removeClass();
	    });
	},

	setMessage: function(message, cls) {
	    this.$el.addClass(cls).html(message).fadeIn('slow');
	},

	isHidden: function() {
	    return this.$el.hasClass('hide');
	},

	// actions
	boardShoot: function() {
	    this.hide();
	    Attack.shoot();
	},

	restart: function() { location.reload(); },
    });

    var Notifications = new NotificationPanel;

    // Init Boards!
    var Defense = new DefenseBoard;
    var Attack  = new AttackBoard;

    Defense.loadShips();
});
