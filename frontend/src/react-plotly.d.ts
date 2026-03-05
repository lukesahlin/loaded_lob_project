declare module 'react-plotly.js' {
  import { Component } from 'react'
  import * as Plotly from 'plotly.js'

  interface PlotParams {
    data: Plotly.Data[]
    layout?: Partial<Plotly.Layout>
    config?: Partial<Plotly.Config>
    style?: React.CSSProperties
    className?: string
    useResizeHandler?: boolean
    onClick?: (event: Plotly.PlotMouseEvent) => void
    onHover?: (event: Plotly.PlotMouseEvent) => void
    onSelected?: (event: Plotly.PlotSelectionEvent) => void
  }

  export default class Plot extends Component<PlotParams> {}
}
