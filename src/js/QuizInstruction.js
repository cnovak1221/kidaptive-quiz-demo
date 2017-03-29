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
let COLOR_HEX = ['#3FBB65', '#F34E4A', '#1B93C0'];
let SIZE = [30, 70, 110];

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

    componentWillUnmount() {
        this.stopAudio();
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
            default:
                //no default
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
            default:
                //no default
        }
    }

    getVisual() {
        switch (this.state.progress) {
            case 1:
                return (
                    <div>
                        {
                          function() {
                              const choices = [3,18,4,16,26,11];
                              let answers = [];
                              for (let y = 0; y < 2; y++) {
                                  for (let x = 0; x < 3; x++) {
                                      let index = x + y * 3;
                                      answers.push(<MockAnswerCard
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
                          }()
                        }
                        <img src={cursor}
                            alt=""
                            style={{
                                position:'absolute',
                                top:'110px',
                                left:'400px'
                            }} 
                        />
                    </div>
                );
            case 2:
                return (
                    <div className="center">
                        {
                          function() {
                              const choices = [0,1,2,12,13,14,24,25,26];
                              let shapes = [];
                              for (let y = 0; y < 3; y++) {
                                  let shapeRow = [];
                                  for (let x = 0; x < 3; x++) {
                                      let index = x + y * 3;
                                      shapeRow.push(
                                        <div style={{   
                                                display: 'inline-block', 
                                                width: '140px', 
                                                top: y * 40 + 'px'
                                            }} 
                                            key={'answer-shape-' + index}
                                        >
                                            <AnswerShape choice={choices[index]} />
                                        </div>
                                      );
                                  }
                                  shapes.push(
                                    <div key={y}>{shapeRow}</div>
                                  )
                              }
                              return shapes;
                          }()
                        }
                    </div>
                );
            case 3:
                return (
                    <div>
                        {
                            function() {
                                const prompt = 511;
                                let prompts = [];
                                for (let x = 0; x < 5; x++) {
                                    let index = Math.floor(x / 2);
                                    if (x % 2){
                                        prompts.push(<img
                                            key={'prompt-add-' + index}
                                            src={add}
                                            alt=""
                                            style={{
                                                bottom:'49px',
                                                left: 23 * x + 'px'
                                            }}
                                        />);
                                    } else {
                                        prompts.push(<MockPromptCard
                                            index={index}
                                            key={'prompt-card-' + index}
                                            div={{
                                                style: {
                                                    left: 23 * x + 'px'
                                                }
                                            }}
                                            img={PROMPT[index]}
                                            imgPos={PROMPT_IMG_POS[index]}
                                            imgState={(prompt >> (index * 3)) & 7}
                                        />);
                                    }
                                }
                                return prompts;
                            }()
                        }
                    </div>
                );
            case 4:
                return (
                    <div>
                        {
                            function() {
                                const prompt = 106;
                                let prompts = [];
                                for (let x = 0; x < 5; x++) {
                                    let index = Math.floor(x / 2);
                                    if (x % 2){
                                        prompts.push(<img
                                            key={'prompt-add-' + index}
                                            src={add}
                                            alt=""
                                            style={{
                                                bottom:'49px',
                                                left: 23 * x + 'px'
                                            }}
                                        />);
                                    } else {
                                        prompts.push(<MockPromptCard
                                            index={index}
                                            key={'prompt-card-' + index}
                                            div={{
                                                style: {
                                                    left: 23 * x + 'px'
                                                }
                                            }}
                                            img={PROMPT[index]}
                                            imgPos={PROMPT_IMG_POS[index]}
                                            imgState={(prompt >> (index * 3)) & 7}
                                        />);
                                    }
                                }
                                return prompts;
                            }()
                        }
                    </div>
                );
            default:
                //no default
        }
    }

    playAudio() {
        this.stopAudio();
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
            default:
                //no default
        }
        this.audio.play();
    }

    stopAudio() {
        this.audio && this.audio.pause();
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
                          <h2 style={{color:'#999999', fontWeight:'bold'}}>Instructions</h2>
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
                          <div style={{top:'60px', minHeight:'310px'}}>
                            {this.getVisual()}
                          </div>
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
                                className='secondary'
                                style={{
                                    position: 'absolute',
                                    width: '136px',
                                    left: '404px',
                                    bottom: '28px'
                                }}
                                onClick={this.playAudio.bind(this)}
                            >Replay</button>
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

class MockPromptCard extends Component {
    render() {
        return(
            <div className='prompt-card' {... this.props.div}>
                {
                    function() {
                        let imgs = [];
                        for (let i in this.props.img) {
                            let pos = this.props.imgPos[i];
                            imgs.push(<img
                                key={'img-' + i}
                                src={this.props.img[i]}
                                alt=""
                                style={{
                                    position:'absolute',
                                    top: pos[1],
                                    left: pos[0],
                                    opacity: (this.props.imgState & (1 << i)) ? 1 : .2
                                }}
                            />);
                        }
                        return(imgs);
                    }.bind(this)()
                }
            </div>
        )
    }
}

class MockAnswerCard extends Component {
    render() {
        return (
            <button
                className={"container answer-card mock-answer-card " + (this.props.selected ? " active" : "")}
                disabled={true}
                {... this.props.button}
            >
                <AnswerShape choice={this.props.choice} />
            </button>
        )
    }

}

class AnswerShape extends Component {
  render() {
      let shape = this.props.choice % 3;
      let color = COLOR_HEX[Math.floor(this.props.choice / 3) % 3];
      let size = SIZE[Math.floor(this.props.choice / 9) % 3];
      return (
          <svg style={{width: size + 'px', height: size + 'px'}} viewBox="0 0 100 100">
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
      );
  }
}

export default QuizInstruction;