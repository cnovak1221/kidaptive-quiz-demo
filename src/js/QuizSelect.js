/**
 * Created by solomonliu on 2017-03-24.
 */
import React, {Component} from 'react';
import ReactDOM from 'react-dom';
import mathImg from '../img/math-image.svg';
import readingImg from '../img/reading-image.svg';
import scienceImg from '../img/science-image.svg';
import codingImg from '../img/coding-image.svg';
import QuizPrompt from './QuizPrompt';

class QuizSelect extends Component {
    render() {
        return(
            <div style={{width:'730px', margin: 'auto', paddingBottom:'240px'}}>
                <h2 className='center' style={{top:'80px'}}>Select a quiz to exercise your skills</h2>
                <QuizSelectButton
                    img={mathImg}
                    label="Math"
                    button={{
                        onClick: this.mathQuiz,
                        style: {
                            top:"120px"
                        }
                    }}

                />
                <QuizSelectButton
                    img={readingImg}
                    label="Reading"
                    button={{
                        style: {
                            top:"120px",
                            left:"24px"
                        }
                    }}
                />
                <QuizSelectButton
                    img={scienceImg}
                    label="Science"
                    button={{
                        style: {
                            top:"160px"
                        }
                    }}
                />
                <QuizSelectButton
                    img={codingImg}
                    label="Coding"
                    button={{
                        style: {
                            top:"160px",
                            left:"24px"
                        }
                    }}
                />
            </div>
        );
    }

    mathQuiz() {
        ReactDOM.render(
            <QuizPrompt/>,
            document.getElementById('root')
        );
    }
}

class QuizSelectButton extends Component {
    constructor(props) {
        if (!props.button) {
            props.button = {};
        }
        if (!props.button.style) {
            props.button.style = {};
        }
        props.button.style.width = '352px';
        props.button.style.height= 'auto';
        super(props);
    }

    render() {
        return(
            <button className='container' {...this.props.button}>
                <img src={this.props.img} alt=""/>
                <h3 className='center' style={{padding:'18px 0'}}>{this.props.label}</h3>
            </button>
        )
    }
}

export default QuizSelect;