import random

from socketio.mixins import BroadcastMixin
from socketio.namespace import BaseNamespace


class BattleShipRoomMixin(object):
    def _find_by_username(self, username):
        """Finds a socket given a `username`."""
        try:
            return [socket
                    for _, socket in self.socket.server.sockets.iteritems()
                    if socket.session.get('username') == username][0]
        except KeyError:
            return None

    def _find_room_players(self, room_name=None):
        """Finds players in the given `room_name`, returns its sockets
        instances.
        """
        room_name = room_name or self._room_name
        return [socket for _, socket in self.socket.server.sockets.iteritems()
                       if socket.session.get('room', '') == room_name]

    def _get_username(self):
        """Returns the username of the current player."""
        return self.session.get('username', '')
    _username = property(_get_username)

    _other_player = None
    def _get_other_player(self):
        """Returns the socket of the opponent player in the room."""
        if self._other_player is None:
            players = self._find_room_players()
            return [
                player
                for player in players
                if player.session.get('username') != self._username
            ][0]
        return self._other_player
    _opponent = property(_get_other_player)

    def _get_room_name(self):
        """Returns the current room name in this session."""
        return self.session.get('room', '')
    _room_name = property(_get_room_name)

    def join(self, username, room_name):
        """Lets a user join a room on a specific Namespace. If the
        room doesn't exist, it creates it.
        """
        # TODO: Restrict rooms to only 2 users per room, and cannot
        #       have the same usernames.
        self.session.setdefault('username', username)
        self.session.setdefault('ready', False)
        self.session.setdefault('room', room_name)

    def leave(self, room_name):
        """Lets a user leave a room on a specific Namespace."""
        # TODO: improve(build) error messages
        try:
            del self.session['room']
            del self.session['username']
            return True
        except KeyError:
            return False

    def emit_to_room(self, event, room_name=None, *args):
        """Sends the `event` to all in the `room_name` (in this
        particular Namespace).
        """
        players = self._find_room_players(room_name)
        if not players:
            return
        pkt = dict(type="event", name=event, args=args, endpoint=self.ns_name)
        for player in players:
            player.send_packet(pkt)

    def emit_to_user(self, event, user=None, *args, **kwargs):
        """Works exactly the same as `BaseNamespace.emit`, but
        pre-selects a socket to emit the package given a
        `user`. If the `user` is not present we assume we're
        emiting this package to the current user, and thus we use
        `emit`.

        :user: can be either a username string or a socket instance.

        For more info read `BaseNamespace.emit`'s documentation.
        """
        if user is None and self.session.has_key('username'):
            return self.emit(event, *args, **kwargs)
        callback = kwargs.pop('callback', None)
        if kwargs:
            raise ValueError(
                "emit() only supports positional argument, to stay "
                "compatible with the Socket.IO protocol. You can "
                "however pass in a dictionary as the first argument")
        pkt = dict(type="event", name=event, args=args, endpoint=self.ns_name)
        if callback:
            # By passing 'data', we indicate that we *want* an explicit ack
            # by the client code, not an automatic as with send().
            pkt['ack'] = 'data'
            pkt['id'] = msgid = self.socket._get_next_msgid()
            self.socket._save_ack_callback(msgid, callback)
        socket = self._find_by_username(user) if isinstance(user, str) else user
        socket.send_packet(pkt)  # maybe catch the attributeerror


class BattleShipNamespace(BaseNamespace, BattleShipRoomMixin, BroadcastMixin):
    def on_user_enters_room(self, username, room_name):
        self.join(username, room_name)
        self.broadcast_event('room_participants',
                             {self._room_name: len(self._find_room_players())})
        self.emit_to_room('announcement', '%s has connected' % username)

    def on_user_is_ready(self):
        """The user has placed all his/her ships on the table and is
        ready to fight.
        """
        self.session['ready'] = True
        self.emit_to_room('announcement', '%s is ready' % self._username)
        players = self._find_room_players()
        if len(players) > 1 and all([player.session['ready']
                                     for player in players]):
            # We're in business! we will just randomly choose one
            # participant to begin the game.
            if random.choice([True, False]):  # Like a coin to the air
                first  = self.socket
                second = self._opponent
            else:
                first  = self._opponent
                second = self.socket
            self.emit_to_user('turn_begins', first)
            self.emit_to_user('turn_ends', second)

    def on_user_shoots(self, tile):
        """The user shoots for a tile!"""
        row, column = tile
        self.emit_to_room('announcement',
                          '%s shoots for %s %s!' % (self._username,
                                                    row, column))
        # there is no need in passing arguments with this event cause
        # the tile is referenced by id, and the calculations for a new
        # state in that clase are made directly into the client.
        tile_id = 'd-%s-%s' % tuple(tile)
        self.emit_to_user('/tiles/%s:receive_shot' % tile_id,
                          self._opponent, {})

    def on_ack_shot(self, ack):
        """Acknowledgement of a shot. Tells the status of a previous
        shot, if it was a hit, a down, or a miss.

        :ack: is a dictionary with two keys:
        * :new_state: the new state of the aimed tile.

        * :tiles_hit: is a list with (row, column) tuples of all the
          affected tiles. This will be commonly only one tile, but in
          case of a Ship shutdown, this list will contain all the
          tiles of that ship.
        """
        new_state = ack['new_state']
        tiles_hit = ack['tiles_hit']
        for tile in tiles_hit:
            tile_id = 'a-%s-%s' % tuple(tile)
            self.emit_to_user('/tiles/%s:ack_shot' % tile_id, self._opponent,
                              {'state': new_state})
        if len(tiles_hit) > 1:
            self.emit_to_room('announcement',
                              '%s lost a %s-tiles battleship!' % \
                              (self._opponent, len(tiles_hit)))
        # change turns
        self.emit_to_user('turn_ends', self._opponent)
        self.emit_to_user('turn_begins')
