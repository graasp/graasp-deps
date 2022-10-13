import React, { MouseEventHandler, useMemo, useState } from 'react';
import GraphVis from 'react-graph-vis';
import data from './generated/data.json';

const shaRegex = /@([a-f0-9]{40})/;

const org = 'graasp';

const labelize = (nodeId: string) =>
  nodeId.match(shaRegex) ? nodeId.slice(0, -34) : nodeId;

const depsSet = new Set(
  Object.entries(data).flatMap(([key, values]) => [...values, key]),
);

const depsList = Array.from(depsSet);

const nodesList = Array.from(depsList).map((v) => ({
  id: v,
  label: labelize(v),
  group: v.replace(shaRegex, ''),
}));

const enum Display {
  INTERNAL = 'internal',
  ALL = 'all',
}

interface ButtonProps {
  children: React.ReactNode;
  position?: { top?: number; right?: number; bottom?: number; left?: number };
  onClick?: MouseEventHandler;
}

function Button({ children, position: pos, onClick }: ButtonProps) {
  return (
    <button style={{ position: 'fixed', ...pos }} onClick={onClick}>
      {children}
    </button>
  );
}

function computeGraph(display: Display) {
  return {
    nodes:
      display === Display.INTERNAL
        ? nodesList.filter((node) => node.id.includes(org))
        : nodesList,
    edges: Object.entries(data).flatMap(([from, deps]) =>
      deps.map((to) => ({ from, to })),
    ),
  };
}

export default function Graph() {
  const [display, setDisplay] = useState(Display.INTERNAL);

  const graph = useMemo(() => computeGraph(display), [display]);

  const options = {
    nodes: {
      shape: 'dot',
      scaling: {
        min: 10,
        max: 30,
        label: {
          min: 10,
          max: 30,
          maxVisible: 20,
        },
      },
      font: {
        size: 12,
        face: 'Tahoma',
      },
    },
    layout: {
      hierarchical: {
        direction: 'LR',
        sortMethod: 'directed',
        levelSeparation: 300,
      },
    },
    edges: {
      width: 0.5,
      color: { inherit: 'from' },
    },
    physics: {
      barnesHut: {
        springConstant: 0.1,
        avoidOverlap: 1,
      },
      forceAtlas2Based: {
        gravitationalConstant: -26,
        centralGravity: 0.005,
        springLength: 230,
        springConstant: 0.18,
      },
      maxVelocity: 146,
      solver: 'forceAtlas2Based',
      timestep: 0.35,
      stabilization: { iterations: 150 },
    },
    height: '100%',
  };

  const events = {
    select: function (event: any) {
      var { nodes, edges } = event;
    },
  };
  return (
    <>
      <GraphVis
        graph={graph}
        options={options}
        events={events}
        getNetwork={(network) => {
          // manipulate graph here
        }}
      />
      <Button
        onClick={() =>
          setDisplay(
            display === Display.INTERNAL ? Display.ALL : Display.INTERNAL,
          )
        }
        position={{ top: 20, left: 20 }}
      >
        Toggle internal / all dependencies
      </Button>
    </>
  );
}
