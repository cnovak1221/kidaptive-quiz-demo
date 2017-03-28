/**
 * Created by solomonliu on 2017-03-26.
 */
import React, {Component} from 'react';
import ReactDOM from 'react-dom';
import QuizPrompt from './QuizPrompt';
import QuizSelect from './QuizSelect';
import audioInstructions1 from '../audio/instructions_01.mp3';
import audioInstructions2 from '../audio/instructions_02.mp3';
import audioInstructions3 from '../audio/instructions_03.mp3';
import audioInstructions4 from '../audio/instructions_04.mp3';
import cursor from '../img/cursor.svg';
import progress1 from '../img/progress-1-4.svg';
import progress2 from '../img/progress-2-4.svg';
import progress3 from '../img/progress-3-4.svg';
import progress4 from '../img/progress-4-4.svg';

import background from '../img/math-quiz-background.png';
import exit from '../img/exit.svg';
import circle from '../img/circle.svg';
import square from '../img/square.svg';
import triangle from '../img/triangle.svg';
import green from '../img/green.svg';
import red from '../img/red.svg';
import blue from '../img/blue.svg';
import small from '../img/small.svg';
import medium from '../img/medium.svg';
import large from '../img/large.svg';
import add from '../img/add.svg';

let PROMPT = [[circle, square, triangle], [green, red, blue], [small, medium, large]];
let PROMPT_IMG_POS = [[[24,37], [76,37], [128, 37]], [[24,37], [76,37], [128, 37]], [[24, 60],[62,45],[113,29]]];
let PROMPT_TEXT = [['circle', 'square', 'triangle'], ['green', 'red', 'blue'], ['small', 'medium', 'large']];
let COLOR_HEX = ['#3FBB65', '#F34E4A', '#1B93C0'];
let SIZE = [30, 70, 110];
let PROMPT_ROOT='/prompt/kidaptive/quiz_demo/';
let ITEM_ROOT='/item/kidaptive/';
let DIM_ROOT='/dimension/early_learning_framework/';
let DIMS = ['shape_identification','color_recognition','categorization'];

class QuizInstruction extends Component {

    constructor(props) {
        super(props);
        this.state = {
            progress: 1
        };
    }

    componentDidMount() {
      this.playAudio();
    }

    getProgress() {
        switch (this.state.progress) {
            case 1:
                return progress1;
            case 2:
                return progress2;
            case 3:
                return progress3;
            case 4:
                return progress4; 
        }
    }

    getInstructions() {
        switch (this.state.progress) {
            case 1:
                return 'In this quiz you will answer questions that will ask you to select some objects but not others.';
            case 2:
                return 'The objects will come in three different shapes, three different colors, and three different sizes.';
            case 3:
                return 'For each question, you will see hints about which shapes, colors, and sizes to select.';
            case 4:
                return 'For example, this hint says that you should select all small squares that are not red.';  
        }
    }

    getVisual() {
        switch (this.state.progress) {
            case 1:
                return (
                    <div style={{top:'60px', paddingBottom:'30px', verticalAlign:'center'}}>
                        {
                          function() {
                              const choices = [3,18,4,16,26,11];
                              let answers = [];
                              for (let y = 0; y < 2; y++) {
                                  for (let x = 0; x < 3; x++) {
                                      let index = x + y * 3;
                                      answers.push(<MockAnswerCard
                                          index={index}
                                          key={'answer-card-' + index}
                                          selected={y === 0 && x === 1}
                                          button={{
                                              style: {
                                                  top: y * 30 + 'px',
                                                  left: x * 58 + 'px'
                                              }
                                          }}
                                          choice={choices[index]}
                                      />);
                                  }
                              }
                              return answers;
                          }.bind(this)()
                        }
                        <img src={cursor}
                            style={{
                                position:'absolute',
                                top:'110px',
                                left:'400px'
                            }} 
                        />
                    </div>
                );
            case 2:
              //TODO SHAPES
              return (
                  <div>Step 2</div>
              );
            case 3:
              //TODO PROMPT
              return (
                  <div>Step 3</div>
              );
            case 4:
              //TODO PROMPT 2
              return (
                  <div>Step 4</div>
              );
        }
    }

    playAudio() {
        this.audio && this.audio.pause();
        switch (this.state.progress) {
            case 1:
              this.audio = new Audio(audioInstructions1);
              break;
            case 2:
              this.audio = new Audio(audioInstructions2);
              break;
            case 3:
              this.audio = new Audio(audioInstructions3);
              break;
            case 4:
              this.audio = new Audio(audioInstructions4);
              break;
        }
        this.audio.play();
    }

    nextPrompt() {
        if (this.state.progress < 4) {
            this.setState({
              progress: this.state.progress + 1
            }, function() {
              this.playAudio();
            });
        } else {
            this.goToQuiz();
        }
    }

    goToQuiz() {
      ReactDOM.render(
          <QuizPrompt/>,
          document.getElementById('root')
      )
    }

    exit() {
      ReactDOM.render(
          <QuizSelect/>,
          document.getElementById('root')
      )
    }

    render() {
        return (
            <div style={{
                background: 'url(' + background + ')',
                width: '100%',
                minHeight: '100%',
                paddingBottom: '207px'
            }}>
                <div style={{
                    width: '968px',
                    top: '80px',
                    margin: 'auto',
                }}>
                    <div className="container" style={{
                        overflow: 'hidden',
                        padding: '111px 0 122px'
                    }}>
                        <div style={{
                            position:'absolute',
                            top:'30px',
                            left:'40px'
                        }}>
                          <h4 onClick={this.playAudio.bind(this)}>Replay</h4>
                        </div>
                        <div style={{
                            position:'absolute',
                            top:'30px',
                            right:'40px'
                        }}>
                            <img
                                src={this.getProgress()}
                                alt=""
                            />
                        </div>
                        <div style={{padding: '0 144px'}}>
                          <h3 className='center'>{this.getInstructions()}</h3>
                          {this.getVisual()}
                        </div>
                        <div
                            id="quiz-bottom-bar"
                            style={{top: '122px'}}>
                              <button
                                className='secondary'
                                style={{
                                    position: 'absolute',
                                    width: '136px',
                                    left: '40px',
                                    bottom: '28px'
                                }}
                                onClick={this.goToQuiz.bind(this)}
                            >Skip</button>
                            <button
                                className='primary'
                                style={{
                                    position: 'absolute',
                                    width: '136px',
                                    right: '40px',
                                    bottom: '28px'
                                }}
                                onClick={this.nextPrompt.bind(this)}
                            >{this.state.progress === 4 ? 'Got It' : 'Continue'}</button>
                        </div>
                    </div>
                    <img src={exit} alt='' 
                        onClick={this.exit.bind(this)}
                        style={{
                            position: 'absolute',
                            top: '-10px',
                            right: '-10px',
                        }}/>
                </div>

            </div>
        )
    }
}

class MockAnswerCard extends Component {

    render() {
        let shape = this.props.choice % 3;
        let color = COLOR_HEX[Math.floor(this.props.choice / 3) % 3];
        let size = SIZE[Math.floor(this.props.choice / 9) % 3];
        let selected = this.props.selected;
        let baseClass = this.props.plain ? "" : "container ";

        return (
            <button
                className={baseClass + "answer-card" + (selected ? " active" : "")}
                disabled={true}
                {... this.props.button}
            >
                <svg style={{width: size + 'px', height: size + 'px', position:'absolute', left: 94 - selected - size / 2 + 'px', top: 70 - selected - size / 2 + 'px'}} viewBox="0 0 100 100">
                    {
                        function() {
                            if (shape === 0) {
                                return <circle cx='50px' cy='50' r='50' fill={color}/>;
                            } else if (shape === 1) {
                                return <rect width='100' height='100' fill={color}/>;
                            } else if (shape === 2) {
                                return <polygon points='100,100 50,0 0,100' fill={color}/>
                            }
                        }()
                    }
                </svg>
            </button>
        )
    }

}

export default QuizInstruction;