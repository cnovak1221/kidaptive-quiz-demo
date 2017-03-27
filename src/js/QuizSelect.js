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
            <div style={{width:'730px', margin: 'auto'}}>
                <div style={{marginTop: '80px'}}>
                    <h2 className='center' style={{margin:'40px 0'}}>Select a quiz to personalize your learning experience</h2>
                    <QuizSelectButton
                        img={mathImg}
                        label="Math"
                        onClick={this.mathQuiz}
                    />
                    <QuizSelectButton
                        img={readingImg}
                        label="Reading"
                        margin="0 0 0 24px"
                    />
                    <QuizSelectButton
                        img={scienceImg}
                        label="Science"
                        margin="40px 0 0 0"
                    />
                    <QuizSelectButton
                        img={codingImg}
                        label="Coding"
                        margin="40px 0 0 24px"
                    />
                </div>
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
    render() {
        return(
            <button className='container' onClick={this.props.onClick} style={{
                margin: this.props.margin,
                width: '352px',
                height: 'auto'
            }}>
                <img src={this.props.img} alt=""/>
                <h3 className='center' style={{padding:'18px 0'}}>{this.props.label}</h3>
            </button>
        )
    }
}

export default QuizSelect;