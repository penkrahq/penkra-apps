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
import androidx.compose.ui.graphics.Color
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
@Composable fun FixedTextTextGrowthFixedWidth() {
  Box(modifier = Modifier.size(340.dp, 180.dp).alpha(1.0f).background(Color(0xFFFFFFFF))) {
    Text(buildAnnotatedString { withStyle(SpanStyle(color = Color(0xFFCC5500), fontSize = with(androidx.compose.ui.platform.LocalDensity.current) { 24.dp.toSp() }, fontWeight = FontWeight(400))) { append("Fixed width text wraps at authored width") } }, style = androidx.compose.ui.text.TextStyle(fontSize = with(androidx.compose.ui.platform.LocalDensity.current) { 24.dp.toSp() }, letterSpacing = 0.sp, textMotion = androidx.compose.ui.text.style.TextMotion.Animated), modifier = Modifier.offset(20.dp, 24.dp).width(160.dp).wrapContentHeight(androidx.compose.ui.Alignment.Top, unbounded = true).alpha(1.0f))
  }
}
