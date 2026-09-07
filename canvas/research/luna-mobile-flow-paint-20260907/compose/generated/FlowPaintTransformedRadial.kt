package generated.canvas

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalLayoutApi::class)
@Composable fun FlowPaintTransformedRadial() {
  val canvasDark = androidx.compose.foundation.isSystemInDarkTheme()
  BoxWithConstraints {
    if (canvasDark == true && maxWidth >= 480.0f.dp) {
      Box(modifier = Modifier.size(420.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Canvas(modifier = Modifier.offset(30.dp, 24.dp).size(360.dp, 140.dp)) { val center = androidx.compose.ui.geometry.Offset(0.27f * size.width, 0.68f * size.height); val brush = androidx.compose.ui.graphics.Brush.radialGradient(colorStops = arrayOf(0.0f to Color(0xFFF4A261), 0.45f to Color(0xFF2A9D8F), 1.0f to Color(0xFF123456)), center = center, radius = 180.0f); withTransform({ rotate(31.0f, center); scale(0.44f, 0.72f, center) }) { drawRect(brush = brush) } }
      }
    }
    else if (maxWidth >= 480.0f.dp) {
      Box(modifier = Modifier.size(420.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Canvas(modifier = Modifier.offset(30.dp, 24.dp).size(360.dp, 140.dp)) { val center = androidx.compose.ui.geometry.Offset(0.27f * size.width, 0.68f * size.height); val brush = androidx.compose.ui.graphics.Brush.radialGradient(colorStops = arrayOf(0.0f to Color(0xFFF4A261), 0.45f to Color(0xFF2A9D8F), 1.0f to Color(0xFF123456)), center = center, radius = 180.0f); withTransform({ rotate(31.0f, center); scale(0.44f, 0.72f, center) }) { drawRect(brush = brush) } }
      }
    }
    else if (canvasDark == true) {
      Box(modifier = Modifier.size(420.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Canvas(modifier = Modifier.offset(30.dp, 24.dp).size(360.dp, 140.dp)) { val center = androidx.compose.ui.geometry.Offset(0.27f * size.width, 0.68f * size.height); val brush = androidx.compose.ui.graphics.Brush.radialGradient(colorStops = arrayOf(0.0f to Color(0xFFF4A261), 0.45f to Color(0xFF2A9D8F), 1.0f to Color(0xFF123456)), center = center, radius = 180.0f); withTransform({ rotate(31.0f, center); scale(0.44f, 0.72f, center) }) { drawRect(brush = brush) } }
      }
    }
    else {
      Box(modifier = Modifier.size(420.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Canvas(modifier = Modifier.offset(30.dp, 24.dp).size(360.dp, 140.dp)) { val center = androidx.compose.ui.geometry.Offset(0.27f * size.width, 0.68f * size.height); val brush = androidx.compose.ui.graphics.Brush.radialGradient(colorStops = arrayOf(0.0f to Color(0xFFF4A261), 0.45f to Color(0xFF2A9D8F), 1.0f to Color(0xFF123456)), center = center, radius = 180.0f); withTransform({ rotate(31.0f, center); scale(0.44f, 0.72f, center) }) { drawRect(brush = brush) } }
      }
    }
  }
}
