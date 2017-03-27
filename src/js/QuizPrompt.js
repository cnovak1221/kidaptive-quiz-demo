/**
 * Created by solomonliu on 2017-03-26.
 */
import React, {Component} from 'react';
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
import progress from '../img/progress.svg';
import trophyWhite from '../img/trophy-white.svg';
import trophyGrey from '../img/trophy-grey.svg';
import add from '../img/add.svg';

let PROMPT = [[circle, square, triangle], [green, red, blue], [small, medium, large]];
let PROMPT_IMG_POS = [[[24,37], [76,37], [128, 37]], [[24,37], [76,37], [128, 37]], [[24, 60],[62,45],[113,29]]];
let PROMPT_TEXT = [['CIRCLE', 'SQUARE', 'TRIANGLE'], ['GREEN', 'RED', 'BLUE'], ['SMALL', 'MEDIUM', 'LARGE']];
let COLOR_HEX = ['#3FBB65', '#F34E4A', '#1B93C0'];
let SIZE = [30, 70, 110];

let shuffle = function(array) {
    for (let i = 0; i < array.length; i++) {
        let temp = array[i];
        let j = i + Math.floor(Math.random() * (array.length - i));
        array[i] = array[j];
        array[j] = temp;
    }
};

class QuizPrompt extends Component {

    constructor(props) {
        super(props);
        let state = QuizPrompt.newPromptState();
        this.state = {
            prompt: state.prompt, //bits in this number represent whether each shape, color and size should be included
            answer: 0, //(answer & (1 << x)) > 0 indicates whether answer x is selected
            choices: state.choices, //array of number 0-26. base3 representation indicates which shape, color and sice the choice is
            progress: 0, //number of questions completed
            showingAnswers: 0 //0 = showing prompt, 1 = incorrect answer, 2 = correct answer
        };
    }

    static checkMatch(prompt, answer) {
        let match = 0;
        for (let j = 0; j < 3; j++) {
            match += ((prompt >> 3 * j) & 7 & (1 << Math.floor(answer / 3 ** j) % 3)) > 0;
        }
        return match;
    }

    static newPromptState() {
        let newPrompt = 511;
        while (newPrompt === 511) {
            newPrompt = 0;
            for (let i = 0; i < 3; i++) {
                newPrompt = (newPrompt << 3) | Math.floor(Math.random() * 7) + 1;
            }
        }

        let full = [];
        let partial = [];
        let none = [];

        for (let i = 0; i < 27; i++) {
            let match = QuizPrompt.checkMatch(newPrompt, i);
            if (match === 3) {
                full.push(i);
            } else if (match === 0) {
                none.push(i);
            }  else {
                partial.push(i);
            }
        }

        shuffle(full);
        shuffle(partial);
        shuffle(none);

        let choices = full.slice(0, Math.min(full.length, 2)).concat(none.slice(0, Math.min(none.length, 2)));
        choices = choices.concat(partial.slice(0, 6 - choices.length));
        shuffle(choices);

        console.log(newPrompt);
        console.log(choices);

        return {
            prompt: newPrompt,
            choices: choices
        }
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
                            right:'40px'
                        }}>
                            <img
                                src={this.state.progress < 5 ? trophyGrey : trophyWhite}
                                style={{
                                    position:'absolute',
                                    top:'18px',
                                    right:'17px'
                                }}
                                alt=""
                            />
                            <img
                                src={progress}
                                alt=""
                            />
                        </div>
                        <div style={{
                            padding: '0 144px'
                        }}>
                            <div>
                            {
                                function() {
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
                                            prompts.push(<PromptCard
                                                index={index}
                                                key={'prompt-card-' + index}
                                                div={{
                                                    style: {
                                                        left: 23 * x + 'px'
                                                    }
                                                }}
                                                img={PROMPT[index]}
                                                imgPos={PROMPT_IMG_POS[index]}
                                                imgState={(this.state.prompt >> (index * 3)) & 7}
                                            />);
                                        }
                                    }
                                    return prompts;
                                }.bind(this)()
                            }
                            </div>
                            <div style={{top:'60px', paddingBottom:'30px', verticalAlign:'center'}}>
                            {
                                function() {
                                    let answers = [];
                                    for (let y = 0; y < 2; y++) {
                                        for (let x = 0; x < 3; x++) {
                                            let index = x + y * 3;
                                            answers.push(<AnswerCard
                                                index={index}
                                                key={'answer-card-' + index}
                                                button={{
                                                    style: {
                                                        top: y * 30 + 'px',
                                                        left: x * 58 + 'px'
                                                    }
                                                }}
                                                choice={this.state.choices[index]}
                                                parent={this}
                                            />);
                                        }
                                    }
                                    return answers;
                                }.bind(this)()
                            }
                            </div>
                        </div>
                        <div id="quiz-bottom-bar" style={{top: '122px'}}>

                        </div>
                    </div>
                    <img src={exit} alt='' style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '-10px',
                    }}/>
                </div>

            </div>
        )
    }
}

class PromptCard extends Component {
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

class AnswerCard extends Component {

    select() {
        this.props.parent.setState((prevState) => {
            if (!prevState.showingAnswers) {
                let mask = 1 << this.props.index;
                let newState = prevState.answer ^ mask;
                return {answer: newState};
            }
        });
    }

    render() {
        let shape = this.props.choice % 3;
        let color = COLOR_HEX[Math.floor(this.props.choice / 3) % 3];
        let size = SIZE[Math.floor(this.props.choice / 9) % 3];
        let selected = this.props.parent.state.answer & (1 << this.props.index) ? 3 : 0;

        return (
            <button
                className={"container answer-card" + (selected ? " active" : "")}
                onClick={this.select.bind(this)}
                disabled={this.props.parent.state.showingAnswers}
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


export default QuizPrompt;