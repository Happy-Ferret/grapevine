import Anser from "anser";
import _ from "underscore"
import PropTypes from 'prop-types';
import React, {Fragment} from 'react';
import Sizzle from "sizzle"
import {Socket} from "phoenix";

import {ClientSocket} from "./socket";
import Keys from './keys';

let body = document.getElementById("body");
let userToken = body.getAttribute("data-user-token");
let sessionToken = body.getAttribute("data-session-token");

const keys = new Keys();

document.addEventListener('keydown', e => {
  if (!keys.isModifierKeyPressed()) {
    document.getElementById('prompt').focus();
  }
});

class SocketProvider extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      lineId: 0,
      lines: [],
      buffer: "",
      gmcp: {},
    }

    this.socket = new ClientSocket(this, this.props.game, userToken, sessionToken);
    this.socket.join();
  }

  processText() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    let increment = 1;
    let parsedText = Anser.ansiToJson(this.state.buffer);

    parsedText = _.map(parsedText, text => {
      text = {...text, id: this.state.lineId + increment};
      increment++;
      return text;
    });

    let lines = [...this.state.lines, ...parsedText];
    this.setState({
      buffer: "",
      lines,
      lineId: this.state.lineId + increment
    });
  }

  appendText(message) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.setState({buffer: this.state.buffer + message});

    this.timer = setTimeout(() => {
      this.processText();
    }, 200);
  }

  receiveGMCP(message, data) {
    this.setState({
      gmcp: {...this.state.gmcp, [message]: data},
    })
  }

  getChildContext() {
    return {
      socket: this.socket,
      gmcp: this.state.gmcp,
      lines: this.state.lines,
    };
  }

  render() {
    return (
      <div>{this.props.children}</div>
    );
  }
}

SocketProvider.childContextTypes = {
  lines: PropTypes.array,
  gmcp: PropTypes.object,
  socket: PropTypes.object,
}

class GaugeProvider extends React.Component {
  getChildContext() {
    return {
      gauges: this.props.gauges,
    };
  }

  render() {
    return (
      <div>{this.props.children}</div>
    );
  }
}

GaugeProvider.childContextTypes = {
  gauges: PropTypes.array,
}

class Prompt extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      history: [],
      index: -1,
      currentText: "",
      displayText: "",
    };

    this.buttonSendMessage = this.buttonSendMessage.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onTextChange = this.onTextChange.bind(this);

    this.shouldSelect = false;
  }

  buttonSendMessage(e) {
    e.preventDefault();
    this.sendMessage();
  }

  onKeyDown(e) {
    switch (e.keyCode) {
      case 13: {
        this.sendMessage();
        e.target.select();

        break;
      }
      case 38: { // up
        e.preventDefault();
        this.shouldSelect = true;
        let index = this.state.index + 1;

        if (this.state.history[index] != undefined) {
          this.setState({
            index: index,
            displayText: this.state.history[index]
          });
        }

        break;
      }
      case 40: { // down
        e.preventDefault();
        this.shouldSelect = true;
        let index = this.state.index - 1;

        if (index == -1) {
          this.setState({
            index: 0,
            displayText: this.state.currentText
          });
        } else if (this.state.history[index] != undefined) {
          this.setState({
            index: index,
            displayText: this.state.history[index]
          });
        }

        break;
      }
    }
  }

  sendMessage() {
    const {socket} = this.context;
    socket.send(`${this.state.displayText}\n`);
    this.addMessageHistory();
  }

  addMessageHistory() {
    let history = this.state.history;

    if (_.first(this.state.history) == this.state.displayText) {
      this.setState({
        index: -1
      });
    } else {
      history = [this.state.displayText, ...history];
      history = _.first(history, 10);

      this.setState({
        history,
        index: 0,
      });
    }
  }

  onTextChange(e) {
    this.setState({
      currentText: e.target.value,
      displayText: e.target.value,
    });
  }

  componentDidUpdate() {
    if (this.shouldSelect) {
      console.log("trying to select text");
      this.shouldSelect = false;
      this.prompt.select();
    }
  }

  render() {
    let displayText = this.state.displayText;

    return (
      <div className="prompt">
        <input id="prompt"
          value={displayText}
          onChange={this.onTextChange}
          type="text"
          className="form-control"
          autoFocus={true}
          onKeyDown={this.onKeyDown}
          ref={el => { this.prompt = el; }} />
        <button id="send" className="btn btn-primary" onClick={this.buttonSendMessage}>Send</button>
      </div>
    );
  }
}

Prompt.contextTypes = {
  socket: PropTypes.object,
};

class AnsiText extends React.Component {
  textStyle(parsed) {
    let style = {};

    if (parsed.bg) {
      style.backgroundColor = `rgb(${parsed.bg})`;
    }

    if (parsed.fg) {
      style.color = `rgb(${parsed.fg})`;
    }

    if (parsed.decoration == "bold") {
      style.fontWeight = "bolder";
    }

    return style;
  }

  render() {
    let text = this.props.text;

    return (
      <span style={this.textStyle(text)}>{text.content}</span>
    );
  }
}

class Terminal extends React.Component {
  componentDidMount() {
    this.scrollToBottom();
  }

  componentDidUpdate() {
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.el.scrollIntoView();
  }

  render() {
    let lines = this.context.lines;

    return (
      <div className="terminal">
        {_.map(lines, text => {
          return (
            <AnsiText key={text.id} text={text} />
          );
        })}
        <div ref={el => { this.el = el; }} />
      </div>
    );
  }
}

Terminal.contextTypes = {
  lines: PropTypes.array,
}

class Gauges extends React.Component {
  gaugesEmpty() {
    let gauges = this.context.gauges;
    return gauges.length == 0;
  }

  dataEmpty() {
    let gmcp = this.context.gmcp;
    return Object.entries(gmcp).length === 0 && gmcp.constructor === Object;
  }

  render() {
    let gauges = this.context.gauges;

    if (this.gaugesEmpty() || this.dataEmpty()) {
      return null;
    }

    return (
      <div className="gauges">
        {_.map(gauges, (gauge, i) => {
          return (
            <Gauge gauge={gauge} key={i} />
          );
        })}
      </div>
    );
  }
}

Gauges.contextTypes = {
  gmcp: PropTypes.object,
  gauges: PropTypes.array,
}

class Gauge extends React.Component {
  render() {
    let {name, message, value, max, color} = this.props.gauge;

    let data = this.context.gmcp[message];

    if (data) {
      let currentValue = data[value];
      let maxValue = data[max];

      let width = currentValue / maxValue * 100;

      let className = `gauge ${color}`;

      return (
        <div className={className}>
          <div className="gauge-bar" style={{width: `${width}%`}} />
          <span>{currentValue}/{maxValue} {name}</span>
        </div>
      );
    } else {
      return null;
    }
  }
}

Gauge.contextTypes = {
  gmcp: PropTypes.object,
}

class Client extends React.Component {
  render() {
    return (
      <SocketProvider game={this.props.game}>
        <GaugeProvider gauges={this.props.gauges}>
          <div className="play">
            <div className="alert alert-danger">
              <b>NOTE:</b> This web client is in <b>beta</b> and might close your connection at any time.
            </div>

            <div className="window">
              <Terminal />
              <Gauges />
              <Prompt />
            </div>
          </div>
        </GaugeProvider>
      </SocketProvider>
    );
  }
}

export {Client}
