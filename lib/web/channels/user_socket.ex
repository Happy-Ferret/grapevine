defmodule Web.UserSocket do
  use Phoenix.Socket

  channel "channels:*", Web.ChatChannel

  def connect(_params, socket) do
    {:ok, socket}
  end

  def id(_socket), do: nil
end
