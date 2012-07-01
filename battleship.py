import random

from socketio.mixins import BroadcastMixin
from socketio.namespace import BaseNamespace


class BattleShipRoomMixin(object):
    NOT_READY = 0  # user's not ready, needs to place ships.
    READY     = 1  # user's ready to fight.

    def __init__(self, *args, **kwargs):
        super(BattleShipNamespace, self).__init__(*args, **kwargs)
        self.rooms = {}  # {<room_name>: {<username>: <status>, ...}, ...}
        self.users_sockets = {}  # {<username>: <socket>, ...}

    def _find_room_players(self, room_name):
        """Finds players in the given `room_name`, returns its sockets
        instances.
        """
        return [socket for _, socket in self.socket.server.sockets.iteritems()
                       if getattr(socket.session, 'room', '') == room_name]

    def _get_player(self):
        """Returns the username of the current player."""
        return self.session.get('username', '')
    _player = property(_get_player)

    _other_player = None
    def _get_other_player(self):
        """Returns the username of the opponent player in the room."""
        if self._other_player is None:
            usernames = self.rooms[self._room_name].keys()
            self._other_player= [username for username in usernames
                                          if username != self._player][0]
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
        self.rooms.setdefault(room_name, {}).update({username: self.NOT_READY})
        self.users_sockets[username] = self.socket
        self.session.setdefault('username', username)
        self.session.setdefault('room', room_name)

    def leave(self, room_name):
        """Lets a user leave a room on a specific Namespace."""
        # TODO: improve(build) error messages
        try:
            self.rooms[room_name].remove(self.session['username'])
            del self.users_sockets[self.session['username']]
            del self.session['room']
            del self.session['username']
            return True
        except (AttributeError, KeyError, ValueError):
            return False

    def emit_to_room(self, event, room_name=None, *args):
        """Sends the `event` to all in the `room_name` (in this
        particular Namespace).
        """
        room_name = room_name or self.session.room
        players = self._find_room_players(room_name)
        if not players:
            return
        pkt = dict(type="event", name=event, args=args, endpoint=self.ns_name)
        for player in players:
            player.send_packet(pkt)

    def emit_to_user(self, event, username=None, *args, **kwargs):
        """Works exactly the same as `BaseNamespace.emit`, but
        pre-selects a socket to emit the package given a
        `username`. If the `username` is not present we assume we're
        emiting this package to the current user, and thus we use
        `emit`.
        For more info read `BaseNamespace.emit`'s documentation.
        """
        if username is None and self.session.has_key('username'):
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
        self.users_sockets[username].send_packet(pkt)


class BattleShipNamespace(BaseNamespace, BattleShipRoomMixin, BroadcastMixin):
    def on_user_enters_room(self, username, room_name):
        self.join(username, room_name)
        self.broadcast_event('room_participants', self.rooms[room_name])
        self.emit_to_room(room_name, 'announcement',
                          '%s has connected' % username)

    def on_user_is_ready(self):
        """The user has placed all his/her ships on the table and is
        ready to fight.
        """
        room = self.rooms[self._room_name]
        room[self._player] = self.READY
        self.emit_to_room('announcement', '%s is ready' % self._player)
        if len(room) > 1 and all([player_status == self.READY
                                  for player_status in room.itervalues()]):
            # We're in business! we will just randomly choose one
            # participant to begin the game.
            usernames = room.keys()
            first  = random.choice(usernames)
            second = [username for username in usernames
                               if username != first][0]
            self.emit_to_user(first,  'turn_begins')
            self.emit_to_user(second, 'turn_ends')

    def on_user_shoots(self, row, column):
        """The user shoots for a tile!"""
        self.emit_to_room('announcement',
                          '%s shoots for %s %s!' % (self._player,
                                                    row, column))
        self.emit_to_user(self._opponent, 'receive_shot',
                          {'row': row, 'column': column},
                          callback=self.ack_shot)

    def ack_shot(self, status, tiles_hit):
        """Acknowledgement of a shot. Tells the status of a previous
        shot, if it was a hit, a down, or a miss.
        """
        # dont know who would be self._player and self._opponent
        # here.
        self.emit_to_user(self._player, 'shot_result', status, tiles_hit)
        # change turns
        self.emit_to_user(self._opponent,  'turn_begins')
        self.emit_to_user(self._player, 'turn_ends')
