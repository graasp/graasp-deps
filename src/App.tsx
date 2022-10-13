import ReactDOM from 'react-dom';
import Graph from './Graph';

export default function App() {
  return <Graph />;
}

const rootElement = document.getElementById('root');
ReactDOM.render(<App />, rootElement);
