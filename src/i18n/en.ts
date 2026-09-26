// Libellés de l'interface, en anglais : c'est la référence. fr.ts doit avoir exactement
// les mêmes clés (vérifié par TypeScript).

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const en = {
  meta: {
    description: 'Show your diagrams step by step. Built with tldraw.',
  },

  common: {
    loading: 'Loading…',
    genericError: 'Something went wrong.',
    untitled: 'Untitled',
    delete: 'Delete',
    close: 'Close',
    moveUp: 'Move up',
    moveDown: 'Move down',
    objects: (n: number) => plural(n, 'object', 'objects'),
    language: 'Language',
    resizeHandle: 'Drag to resize · double-click to reset',
  },

  home: {
    title: 'My diagrams',
    logout: 'Log out',
    localNotice: {
      before: 'Your diagrams are saved ',
      strong: 'in this browser only',
      after:
        '. To back them up or move them: use “Save as…” (steps panel, or ☰ menu) in a diagram, then “Open a .tldr file” here, or drop the file on this page.',
    },
    newDiagram: '+ New diagram',
    createExample: 'Create the example (the water cycle)',
    exampleTitle: 'Demo: The water cycle',
    openFile: 'Open a .tldr file…',
    openFileHint: 'Or drop a .tldr file on this page',
    modified: (date: string) => `Modified ${date}`,
    empty: 'No diagrams yet. Start with the example to see how it works.',
    confirmDelete: (title: string) => `Delete “${title}”? This cannot be undone.`,
  },

  landing: {
    github: 'GitHub',
    tagline: 'Show your diagrams step by step',
    intro:
      'Unveilboard turns a tldraw canvas into a progressive presentation. Reveal a diagram one step at a time, with a narration alongside, instead of showing everything at once.',
    tryExample: 'Try the example',
    newDiagram: 'New diagram',
    openFile: 'or open a .tldr file',
    privacy: 'No account needed. Your diagrams stay in your browser.',
    yourDiagrams: 'Your diagrams',
    demoLabel: 'Animated preview: a diagram revealed in four steps',
    demo: {
      problem: 'Problem',
      first: 'Hypothesis 1',
      second: 'Hypothesis 2',
      result: 'Result',
      captions: ['Start with the problem', 'A first hypothesis', 'A second one; the first fades', 'Reach the result'],
      step: (i: number, n: number) => `Step ${i} / ${n}`,
    },
    features: [
      {
        title: 'Reveal step by step',
        text: 'At each step, show, dim, hide or highlight shapes. The camera follows what matters.',
      },
      {
        title: 'Narrate as you go',
        text: 'Each step has its own text, displayed next to the diagram.',
      },
      {
        title: 'Present with ease',
        text: 'Keyboard or clicker, laser pointer, overview, and edits on the fly.',
      },
      {
        title: 'The whole tldraw editor',
        text: 'Draw freely, build trees and mind maps, save and open .tldr files.',
      },
    ],
    footer: {
      openSource: 'Open source, MIT license',
      builtWith: 'Built with tldraw',
      notAffiliated: 'Unveilboard is not affiliated with tldraw Inc.',
    },
  },

  login: {
    subtitle: 'Personal access.',
    password: 'Password',
    submit: 'Enter',
    submitting: 'Logging in…',
    wrongPassword: 'Wrong password.',
    notConfigured: 'APP_PASSWORD is not configured on the server.',
  },

  panel: {
    expand: 'Expand the steps panel',
    sequence: 'Sequence',
    back: '← My diagrams',
    saveAs: 'Save as…',
    saveAsHint:
      'Save this diagram to a .tldr file (sequence included): backup, transfer, or opening on tldraw.com. Also in the ☰ menu.',
    collapse: 'Collapse the panel',
    present: '▶ Present',
    presentFromStep: '▶ From step',
    presentFromStepHint: 'Present from the selected step',
    step: 'Step',
    newStepHint: (after: number | null, withSelection: boolean) =>
      `New step${after !== null ? ` after step ${after}` : ''}${withSelection ? ', showing the selection' : ''}`,
    spotlight: 'Mask',
    spotlightHint: (withSelection: boolean, step: number | null) =>
      `Masking layer${withSelection ? ' around the selection' : ''}${step !== null ? `, at step ${step}` : ''}. During the presentation, everything is blurred except this rectangle; a new layer replaces the previous one, and “Hide” removes it.`,
    quick: 'Quick',
    quickHint:
      'Quick sequencing: each new object is offered to the active step, or to a new step before / after it (keys 1, 2, 3). Objects of later steps are faded.',
    numbers: 'Numbers',
    hideNumbers: 'Hide step numbers on the canvas',
    showNumbers: 'Show step numbers on the canvas',
    appearsAtStep: (n: number) => `This object appears at step ${n}.`,
    selected: (n: number) => `${plural(n, 'object', 'objects')} selected.`,
    selectHint: 'Select objects on the canvas to add them to a step.',
    noSteps: 'No steps yet. Select objects, then click “Step”.',
    shortcuts: {
      intro: 'While presenting:',
      next: 'next',
      space: 'Space',
      previous: 'previous',
      overview: 'overview',
      recenter: 'recenter',
      laser: 'laser',
      mask: 'masking layer',
      narration: 'narration',
      fullscreen: 'fullscreen',
      esc: 'Esc',
      exit: 'exit',
    },
  },

  step: {
    defaultTitle: (n: number) => `Step ${n}`,
    newTitle: 'New step',
    deselect: 'Click to deselect',
    presentFrom: 'Present from this step',
    delete: 'Delete the step',
    selectTargets: 'Select these objects on the canvas',
    removeAction: 'Remove the action',
    addSelection: (label: string) => `Add the selection: ${label}`,
    selectObjects: 'Select objects',
    camera: 'Camera',
    narrationPlaceholder: 'Narration shown to the audience (**bold**, *italic*, > quote)',
  },

  sequence: {
    defaultTitle: 'New sequence',
  },

  actions: {
    show: 'Show',
    hide: 'Hide',
    dim: 'Dim',
    undim: 'Restore',
    fold: 'Collapse branch',
    unfold: 'Expand branch',
    expand: 'Expand detail',
    collapse: 'Collapse detail',
    highlight: 'Highlight',
    focus: 'Focus',
  },

  camera: {
    follow: 'Follow',
    overview: 'Overview',
    keep: 'Stay put',
  },

  effects: {
    fade: 'Fade',
    draw: 'Draw',
    rise: 'Rise',
    none: 'None',
  },

  presenter: {
    hideNarration: 'Hide the narration (N)',
    hideNarrationLabel: 'Hide the narration',
    previous: 'Previous (←)',
    next: 'Next (→, Space)',
    overview: 'Overview (O)',
    recenter: 'Recenter on the step (C)',
    lock: 'Lock the document again',
    unlock: 'Unlock: edit the diagram during the presentation',
    narration: 'Narration (N)',
    fullscreen: 'Fullscreen (F)',
    exit: 'Exit the presentation (Esc)',
  },

  laser: {
    pointer: 'Laser pointer (K)',
    settings: 'Laser settings',
    color: 'Color',
    colorValue: (c: string) => `Color ${c}`,
    otherColor: 'Other color',
    customColor: 'Custom color',
    width: 'Width',
    fadeAfter: 'Fades after',
    reset: 'Reset',
  },

  spotlight: {
    finish: 'Finish adjusting the mask (M)',
    draw: 'Masking layer: draw the area to keep readable (M)',
    remove: 'Remove the mask (Esc)',
    removeLabel: 'Remove the mask',
    hint: 'Draw the area to keep readable · Esc to finish',
    shapeLabel: 'Masking layer',
  },

  quick: {
    title: 'Quick sequencing',
    previousStep: 'Previous step',
    nextStep: 'Next step',
    stepOf: (i: number, n: number) => `Step ${i} / ${n}`,
    noSteps: 'No steps',
    createHint: 'Create an object to place it in the sequence',
    quit: 'Leave quick sequencing',
    ignore: 'Ignore',
    ignoreHint: 'Leave these objects out of the sequence (visible from the start)',
    alreadyAt: (steps: string) => ` · already at step ${steps}`,
    newBefore: '← New step before',
    newBeforeHint: 'Create an intermediate step, just before the current step',
    addToStep: (n: number) => `Add to step ${n}`,
    addToStepHint: 'Show these objects at the current step',
    newAfter: 'New step after →',
    firstStep: 'First step →',
    newAfterHint: 'Create a step just after the current step, and go to it',
  },

  presets: {
    docOnly: (name: string) => `${name} (preset of this diagram)`,
    manage: 'Manage presets…',
    confirmDelete: (name: string) => `Delete the preset “${name}”? Shapes already styled won't change.`,
    promptArrow: 'Relation name (e.g. “leads to”):',
    promptShape: 'Preset name (e.g. “Thesis”):',
    name: 'Name',
    noLabel: '(no label)',
    labelHint: 'Label added to an arrow that has no text yet',
    fromSelection: '← selection',
    fromSelectionHint: "Take the style of the selection (shapes already styled won't change)",
    newFromArrow: '+ New, from the selected arrow',
    newFromShape: '+ New, from the selected shape',
    title: 'Style presets',
    intro:
      'Shared by all your diagrams. To create or change a preset, style a shape with the style panel, select it, then click “from the selection”.',
    notSaved: (error: string) => `Presets not saved: ${error}`,
    shapes: 'Shapes',
    arrows: 'Relations (arrows)',
    docOnlyTitle: 'Only in this diagram',
    addToMine: 'Add to my presets',
    showInPanel: 'Show presets in the style panel',
    confirmReset: 'Replace all your presets with the default ones?',
    reset: 'Restore the default presets',
    saveFailed: 'Could not save.',
    menu: 'Style presets…',
  },

  /** Préréglages de départ : noms des formes, et noms / étiquettes des flèches. */
  presetDefaults: {
    statement: 'Statement',
    concept: 'Concept',
    question: 'Question',
    problem: 'Problem',
    example: 'Example',
    quote: 'Quote',
    supports: 'supports',
    objects: 'objects to',
    refutes: 'refutes',
    presupposes: 'presupposes',
    illustrates: 'illustrates',
    answers: 'answers',
    defines: 'defines',
    raises: 'raises',
    distinguishes: 'distinguishes',
    implies: 'implies',
  },

  tree: {
    addDetail: '+ Detail',
    addDetailHint: 'Detailed text under the box, which you can expand or collapse (also during the presentation)',
    toggleDetailHint: 'Show / hide the detail of the box',
    collapseDetail: '▴ Collapse detail',
    expandDetail: '▾ Expand detail',
    startTree: 'start a tree from this box',
    toggleFoldHint: 'Hide / show the descendants',
    unfoldCount: (n: number) => `▸ Expand (${n})`,
    fold: '▾ Collapse',
    relayout: 'Tidy up',
    relayoutHint: 'Put each node back in its computed place (undoes manual moves)',
    directionHint: 'Grow the tree to the right or downwards',
    right: '→ To the right',
    down: '↓ Downwards',
    child: 'child',
    enter: 'Enter',
    sibling: 'sibling',
    expandDetailBadge: 'Expand the detail',
    expandBranch: 'Expand the branch',
  },

  sync: {
    states: {
      loading: 'Loading…',
      saved: 'Saved',
      pending: 'Changes…',
      saving: 'Saving…',
      offline: 'Offline',
      conflict: 'Conflict',
      error: 'Error',
    },
    savedLocal: 'Saved in this browser only (local mode)',
    savedCloud: 'Saved online',
    keepLocalHint: 'Your local changes are backed up in this browser before being replaced',
    loadOther: 'Load the other version',
    loadOnline: 'Load the online version',
    keepMine: 'Keep mine',
    reconnect: 'Log in again',
    modifiedElsewhere: (cloud: boolean) =>
      `This diagram was changed ${cloud ? 'on another device' : 'in another tab'}.`,
  },

  errors: {
    offline: 'No connection: changes are kept on this device.',
    sessionExpired: 'Session expired: please log in again.',
    server: (status: number) => `Server error (${status}).`,
    fileTooLarge: 'File too large for the server.',
    storageFull: 'Browser storage is full.',
    storageUnavailable: 'Browser storage is unavailable.',
    notFound: 'Document not found.',
    invalidTldr: 'This is not a valid .tldr file.',
    imageTooLarge: 'Image too large (4 MB maximum).',
  },

  files: {
    typeDescription: 'tldraw diagram',
    defaultName: 'diagram',
    open: 'Open a .tldr file…',
    saveAs: 'Save as… (.tldr)',
  },
}

export type Messages = typeof en
