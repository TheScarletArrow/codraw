/** A file as draw.io writes it: HTML labels, an <object>, an edge label, a straight edge and a page with two layers. */
export const SAMPLE_DRAWIO = `<mxfile host="app.diagrams.net" agent="Mozilla/5.0" version="24.7.17">
  <diagram id="ctx-page" name="Контекст">
    <mxGraphModel dx="1434" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="WIyWlLk6GJQsqvUZBH1w-0" />
        <mxCell id="WIyWlLk6GJQsqvUZBH1w-1" parent="WIyWlLk6GJQsqvUZBH1w-0" />
        <mxCell id="api" value="&lt;b&gt;API&lt;/b&gt;&lt;br&gt;Gateway" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="WIyWlLk6GJQsqvUZBH1w-1">
          <mxGeometry x="40" y="80" width="120" height="60" as="geometry" />
        </mxCell>
        <object label="Users DB" tooltip="Primary storage" id="db">
          <mxCell style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;" vertex="1" parent="WIyWlLk6GJQsqvUZBH1w-1">
            <mxGeometry x="280" y="70" width="60" height="80" as="geometry" />
          </mxCell>
        </object>
        <mxCell id="edge" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="WIyWlLk6GJQsqvUZBH1w-1" source="api" target="db">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="220" y="110" />
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="label" value="SQL" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];" vertex="1" connectable="0" parent="edge">
          <mxGeometry x="-0.2" relative="1" as="geometry">
            <mxPoint as="offset" />
          </mxGeometry>
        </mxCell>
        <mxCell id="straight" value="Первая строка&#xa;Вторая строка" style="endArrow=none;dashed=1;" edge="1" parent="WIyWlLk6GJQsqvUZBH1w-1">
          <mxGeometry width="50" height="50" relative="1" as="geometry">
            <mxPoint x="40" y="200" as="sourcePoint" />
            <mxPoint x="160" y="200" as="targetPoint" />
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="layers-page" name="Слои">
    <mxGraphModel>
      <root>
        <mxCell id="r" />
        <mxCell id="1-1" parent="r" />
        <mxCell id="1" value="На первом слое" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1-1">
          <mxGeometry x="10" y="10" width="80" height="80" as="geometry" />
        </mxCell>
        <mxCell id="layer-2" value="Слой 2" parent="r" />
        <mxCell id="top" value="На втором слое" style="text;html=1;" vertex="1" parent="layer-2">
          <mxGeometry x="100" y="10" width="80" height="30" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`

/** The model of a page on its own, without <mxfile>. */
export const SINGLE_MODEL = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Один" vertex="1" parent="1"><mxGeometry x="1" y="2" width="3" height="4" as="geometry"/></mxCell></root></mxGraphModel>`
