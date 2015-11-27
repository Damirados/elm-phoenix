module Phoenix.Channel
  ( Channel
  , Status(..)
  , Response(..)
  , ChannelError(..)
  , channel, params, onStateChange, on
  , join, tryJoin, push, tryPush, updateParams, leave
  , toString
  ) where

{-| Elm adapter for Phoenix Channels

## Basic channel configuration

@docs channel, params

## Hooks

@docs Status, Response, onStateChange, on

## Channel management

@docs Channel, ChannelError, join, tryJoin
@docs updateParams
@docs push, tryPush
@docs leave

## Other

@docs toString

-}


import Task exposing (Task)
import Json.Decode
import Native.Phoenix
import Phoenix.Socket exposing (Socket)


{-| Opaque type representing a Phoenix Channel
-}

type Channel = Channel


{-| The current status of the `Channel`:

* `Unknown` - may be used to initialize a model or signal, before the actual
  state is known
* `Joined` - a positive response to the join request was received; includes
  the data included in the response
* `Rejected` - the join request was rejected by the server; includes the
  data included in the response
* `Left` - the channel subscription was ended by the client or the server
* `Error` - an error occurred, typically in the underlying `Socket` connection
-}

type Status
  = Unknown
  | Joined Json.Decode.Value
  | Rejected Json.Decode.Value
  | Left
  | Error Json.Decode.Value


{-| Possible responses for state change and message notification callbacks:

* `Ignore`: ignore the message
* `Reply`: push the given reply to the channel
* `Leave`: leave the channel
* `SendMessage`: send the given message to the Elm application
* `PerformTask`: perform the specified task
-}

type Response x a
  = Ignore
  | Reply String Json.Decode.Value
  | Leave
  | SendMessage Signal.Message
  | PerformTask (Task x a)


type alias StateChangeCallback x a =
  Status -> Response x a


type alias EventCallback x a =
  Json.Decode.Value -> Response x a


type alias Hook x a =
  { event: String
  , callback: EventCallback x a
  }


type alias Options x a =
  { socket: Socket
  , topic: String
  , params: Maybe Json.Decode.Value
  , onStateChange: Maybe (StateChangeCallback x a)
  , on: List (Hook x a)
  }


{-| The failure reason for join and push operations. In case of `ErrorReply`
the data sent by the server is included as a JSON value.
-}

type ChannelError
  = ErrorReply Json.Decode.Value
  | Timeout


{-| Create a basic Phoenix channel configuration for the given
topic and socket. Use `on` to attach event callbacks before calling
`join`.
-}

channel : String -> Socket -> Options x a
channel topic socket =
  Options socket topic Nothing Nothing []


{-| The (initial) parameters to send to the server when joining the
channel.
-}

params : Json.Decode.Value -> Options x a -> Options x a
params params options =
  { options
    | params = Just params
  }


{-| Enable state change notification. From the moment the `join` function
is called, for the lifetime of the channel, any state changes will trigger
the specified callback, passing in the latest channel status.
-}

onStateChange : StateChangeCallback x a -> Options x a -> Options x a
onStateChange callback options =
  { options
    | onStateChange = Just callback
  }


{-| Configures an event callback for a channel.
-}

on : String -> EventCallback x a -> Options x a -> Options x a
on event callback options =
  { options
    | on = Hook event callback :: options.on
  }


{-| Join the channel with the given topic. Returns a `Task` that always
succeeds with a `Channel` handle. Status changes will be reported through
the onStateChange callback, if enabled.
-}

join : Options x a -> Task x Channel
join =
  Native.Phoenix.join


{-| Try to join the channel with the given topic, with the specified timeout
(in milliseconds). Returns a `Task` that will succeed with a `Channel` handle
or fail with a JoinError.
-}

tryJoin : Int -> Options x a -> Task ChannelError (Channel, Json.Decode.Value)
tryJoin =
  Native.Phoenix.tryJoin


{-| Push a message onto the channel. Returns a task that always succeeds,
without tracking delivery of the message.
-}

push : String -> Json.Decode.Value -> Channel -> Task x ()
push =
  Native.Phoenix.push

{-| Try to deliver a message to the server, with the given timeout in
milliseconds. Returns a task that either succeeds with the JSON value
returned by the server, or a `ChannelError` describing the error. Note that
a `Timeout` response does not mean the message will never reach the server!
-}

tryPush : String -> Json.Decode.Value -> Int -> Channel -> Task ChannelError Json.Decode.Value
tryPush =
  Native.Phoenix.tryPush


{-| Update the parameters to be sent to the server when rejoining the channel
after a channel failure. Returns a task that always succeeds.
-}

updateParams : Json.Decode.Value -> Channel -> Task x ()
updateParams =
  Native.Phoenix.updateChannelParams


{-| Leave the channel. Returns a task that always succeeds.
-}

leave : Channel -> Task x ()
leave =
  Native.Phoenix.leave


{-| Return a printable representation of the channel. Useful for logging
or debugging, since the native `phoenix.js` objects have circular references
that cause stack overflows in Elm's `toString`.
-}

toString : Channel -> String
toString =
  Native.Phoenix.channelToString
