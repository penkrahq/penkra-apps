package com.penkra.canvas.fixture

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.IntSize
import generated.canvas.*

class MainActivity : ComponentActivity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    val caseID = intent.getStringExtra("canvasCase") ?: "uniform-single-run"
    val nonce = intent.getStringExtra("canvasNonce") ?: "missing"
    setContent { Box(modifier = Modifier.onGloballyPositioned { coordinates ->
      val size: IntSize = coordinates.size
      Log.i("CanvasFixedText", "LUNA_FIXED_TEXT_READY case=$caseID nonce=$nonce width=${size.width} height=${size.height}")
    }) { FixedTextSelection.view(caseID) } }
  }
}

object FixedTextSelection {
  @androidx.compose.runtime.Composable fun view(id: String) {
    when (id) {
      "uniform-single-run" -> FixedTextUniformSingleRunText()
      "mixed-size-rich-runs" -> FixedTextMixedSizeRichRuns()
      "decorations" -> FixedTextDecorations()
      "wrapping" -> FixedTextBoundedWrapping()
      else -> error("Unknown fixed text case: $id")
    }
  }
}
