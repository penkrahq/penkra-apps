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
@Composable fun FlowPaintRuntimeAppearanceViewport() {
  val canvasDark = androidx.compose.foundation.isSystemInDarkTheme()
  BoxWithConstraints {
    if (canvasDark == true && maxWidth >= 480.0f.dp) {
      Box(modifier = Modifier.size(700.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Row(modifier = Modifier.offset(150.dp, 40.dp).size(260.dp, 150.dp).alpha(1.0f).background(Color(0xFFE76F51)).padding(start = 20.dp, top = 30.dp, end = 10.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(0.dp, androidx.compose.ui.Alignment.Start), verticalAlignment = androidx.compose.ui.Alignment.Top) {
          Spacer(Modifier.size(70.dp, 54.dp).alpha(1.0f).background(Color(0xFFF4A261), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
        }
      }
    }
    else if (maxWidth >= 480.0f.dp) {
      Box(modifier = Modifier.size(700.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Row(modifier = Modifier.offset(150.dp, 40.dp).size(260.dp, 150.dp).alpha(1.0f).background(Color(0xFF264653)).padding(start = 20.dp, top = 30.dp, end = 10.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(0.dp, androidx.compose.ui.Alignment.Start), verticalAlignment = androidx.compose.ui.Alignment.Top) {
          Spacer(Modifier.size(70.dp, 54.dp).alpha(1.0f).background(Color(0xFFF4A261), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
        }
      }
    }
    else if (canvasDark == true) {
      Box(modifier = Modifier.size(420.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Row(modifier = Modifier.offset(24.dp, 40.dp).size(190.dp, 150.dp).alpha(1.0f).background(Color(0xFFE76F51)).padding(start = 10.dp, top = 10.dp, end = 10.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(0.dp, androidx.compose.ui.Alignment.Start), verticalAlignment = androidx.compose.ui.Alignment.Top) {
          Spacer(Modifier.size(70.dp, 54.dp).alpha(1.0f).background(Color(0xFFF4A261), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
        }
      }
    }
    else {
      Box(modifier = Modifier.size(420.dp, 360.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
        Row(modifier = Modifier.offset(24.dp, 40.dp).size(190.dp, 150.dp).alpha(1.0f).background(Color(0xFF264653)).padding(start = 10.dp, top = 10.dp, end = 10.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(0.dp, androidx.compose.ui.Alignment.Start), verticalAlignment = androidx.compose.ui.Alignment.Top) {
          Spacer(Modifier.size(70.dp, 54.dp).alpha(1.0f).background(Color(0xFFF4A261), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
        }
      }
    }
  }
}
