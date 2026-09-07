package com.penkra.canvas.flowpaint

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.IntSize
import generated.canvas.*

class MainActivity : ComponentActivity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    val caseID = intent.getStringExtra("canvasCase") ?: "wrap-horizontal-start"
    val nonce = intent.getStringExtra("canvasNonce") ?: "missing"
    setContent { Box(modifier = Modifier.onGloballyPositioned { coordinates ->
      val size: IntSize = coordinates.size
      val origin = coordinates.positionInWindow()
      Log.i("CanvasFlowPaint", "LUNA_FLOW_PAINT_READY case=$caseID nonce=$nonce")
      Log.i("CanvasFlowPaint", "LUNA_FLOW_PAINT_ROOT case=$caseID nonce=$nonce x=${origin.x} y=${origin.y} width=${size.width} height=${size.height} scale=${resources.displayMetrics.density}")
    }) { FlowPaintSelection.view(caseID) } }
  }
}

object FlowPaintSelection {
  @androidx.compose.runtime.Composable fun view(id: String) {
    when (id) {
      "wrap-horizontal-start" -> FlowPaintWrapHorizontalStart()
      "wrap-horizontal-center" -> FlowPaintWrapHorizontalCenter()
      "wrap-horizontal-end" -> FlowPaintWrapHorizontalEnd()
      "wrap-vertical" -> FlowPaintWrapVertical()
      "absolute-overlay" -> FlowPaintAbsoluteOverlay()
      "aggregate-fill" -> FlowPaintAggregateFill()
      "transformed-linear" -> FlowPaintTransformedLinear()
      "transformed-radial" -> FlowPaintTransformedRadial()
      "rounded-scalar-overflow" -> FlowPaintRoundedScalarOverflow()
      "rounded-corners-overflow" -> FlowPaintRoundedCornersOverflow()
      "runtime-appearance-viewport" -> FlowPaintRuntimeAppearanceViewport()
      else -> error("Unknown flow-paint case: $id")
    }
  }
}
