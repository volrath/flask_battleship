$(function(){
    var TILE_UNTOCHED = -1,
        TILE_AIMED    = 0,
        TILE_MISSED   = 1,
        TILE_LOADING  = 2,
        TILE_HIT      = 3,
        TILE_DOWN     = 4,
        TILE_SHIP     = 5,
        STATE_CLASS   = {};

    STATE_CLASS[TILE_UNTOCHED] = 'untouched';
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
		state: TILE_UNTOCHED,
		clickable: false
		// required attrs:
		// x -- row (from 1 to 10)
		// y -- column (from A to J)
	    };
	},

	isClickeable: function() {
	    return this.get('clickable') &&
		   (this.get('state') != TILE_UNTOCHED ||
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
		if (tile !== this) tile.set('state', TILE_UNTOCHED)
	    });
	    // Toggle state...
	    var currentState = this.model.get('state');
	    this.model.set('state', (currentState == TILE_UNTOCHED ? TILE_AIMED : TILE_UNTOCHED));
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
	    // Creates the 100 tiles
	    for (i = 1; i <= 10; i++) {
		this.currentRow = $('<tr class="row-' + i + '"></tr>').appendTo(this.table);
		for (j = 65; j < 75; j++)
		    this.tiles.add({
			x: i,
			y: String.fromCharCode(j),
		    });
	    }
	},

	addTile: function(tile) {
	    var tileView = new TileView({model: tile, board: this});
	    this.currentRow.append(tileView.render(this).el);
	},

	isActive: function() {
	    return this.$el.hasClass('active');
	}
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
});
