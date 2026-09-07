package com.penkra.canvas.fixture

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
    val caseID = intent.getStringExtra("canvasCase") ?: "uniform-single-run"
    val nonce = intent.getStringExtra("canvasNonce") ?: "missing"
    setContent { Box(modifier = Modifier.onGloballyPositioned { coordinates ->
      val size: IntSize = coordinates.size
      val origin = coordinates.positionInWindow()
      val density = resources.displayMetrics.density
      Log.i("CanvasFixedText", "LUNA_FIXED_TEXT_READY case=$caseID nonce=$nonce")
      Log.i("CanvasFixedText", "LUNA_FIXED_TEXT_ROOT case=$caseID nonce=$nonce x=${origin.x} y=${origin.y} width=${size.width} height=${size.height} scale=$density")
    }) { FixedTextSelection.view(caseID) } }
  }
}

object FixedTextSelection {
  @androidx.compose.runtime.Composable fun view(id: String) {
    when (id) {
      "uniform-single-run" -> FixedTextUniformSingleRunText()
      "top-level-style-spacing" -> FixedTextTopLevelStyleAndFractionalSpacing()
      "top-level-decorations" -> FixedTextTopLevelDecorations()
      "rich-run-fill-family" -> FixedTextRichRunFillAndFamily()
      "rich-run-size" -> FixedTextMixedSizeRichRuns()
      "rich-run-italic-spacing" -> FixedTextRichRunItalicAndFractionalSpacing()
      "rich-run-decorations" -> FixedTextRichRunDecorations()
      "marks-and-paragraphs" -> FixedTextMarksAndParagraphs()
      "text-growth-auto" -> FixedTextTextGrowthAuto()
      "text-growth-fixed-width" -> FixedTextTextGrowthFixedWidth()
      "text-growth-fixed-width-height" -> FixedTextTextGrowthFixedWidthHeight()
      else -> error("Unknown fixed text case: $id")
    }
  }
}
