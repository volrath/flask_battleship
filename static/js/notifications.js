$(function() {
    /*
      MODELS
      -------------------------------------------------------------------------
     */
    var Notification = Backbone.Model.extend({
	defaults: function() {
	    return {
		cls: 'info',  // info, success, failure
		text: 'Empty notification',
	    }
	},

	initialize: function() {
	    if (!this.get('cls'))
		this.set({'cls': this.defaults.cls});
	}
    });


    /*
      COLLECTIONS
      -------------------------------------------------------------------------
     */
    var NotificationList = Backbone.Collection.extend({
	model: Notification,

	url: '/notifications',

	initialize: function() {
	    _.bindAll(this, 'add');
	    this.ioBind('create', window.io, this.add);
	},
    });

    var Notifications = new NotificationList;


    /*
      VIEWS
      -------------------------------------------------------------------------
     */
    var NotificationView = Backbone.View.extend({
	tagName: 'li',

	initialize: function() {
	    this.model.bind('change', this.render, this);
	},

	render: function() {
	    this.$el.text(this.model.get('text')).addClass(this.model.get('cls')).hide();
	    return this;
	},
    });


    var NotificationPanel = Backbone.View.extend({
	el: $('#notification'),

	usersTemplate: _.template('Users logged in: <span><%= users %></span>'),

	events: {
	    'click #shoot':   'boardShoot',
	    'click #notification-header': 'toggleList',
	},

	initialize: function() {
	    this.shoot  = this.$('#shoot');
	    this.header = this.$('#notification-header');
	    this.users  = this.$('#logged-users');
	    this.list   = this.$('#notification-list');

	    Notifications.bind('add', this.addNotification, this);
	    _.bindAll(this, 'renderUsers');
	    window.io.on('room_participants', this.renderUsers);

	    this.renderUsers({users: 'None'});
	},

	add: function(nt) { Notifications.add(nt) },

	addNotification: function(notification) {
	    var nt_view = new NotificationView({model: notification})
	      , self    = this;
	    this.list.append(nt_view.render().el);
	    nt_view.$el.fadeIn('fast', function() {
		self.list.scrollTop(self.list.height());
	    });
	},

	toggleList: function() {
	    this.list.slideToggle('fast');
	},

	renderUsers: function(data) {
	    this.users.html(this.usersTemplate(data));
	},

	renderShoot: function() {
	    this.shoot.slideDown('fast');
	},

	boardShoot: function() {
	    this.shoot.fadeOut('fast');
	    window.Attack.shoot();
	},
    });

    window.notifications = new NotificationPanel;
});