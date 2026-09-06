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
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalLayoutApi::class)
@Composable fun MobileFixture() {
  Box(modifier = Modifier.size(393.dp, 852.dp).alpha(1.0f).background(Color(0xFFF6F2EA))) {
    Spacer(Modifier.offset(20.dp, 60.dp).size(10.dp, 10.dp).alpha(1.0f).background(Color(0xFFE400FF), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
    Spacer(Modifier.offset(20.dp, 100.dp).size(300.dp, 70.dp).alpha(1.0f).background(Color(0x88336699), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
    Spacer(Modifier.offset(20.dp, 190.dp).size(300.dp, 70.dp).alpha(1.0f).background(Color(0x88336699), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
    Spacer(Modifier.offset(20.dp, 280.dp).size(300.dp, 70.dp).alpha(1.0f).background(Color(0x88336699), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
    Spacer(Modifier.offset(20.dp, 370.dp).size(300.dp, 70.dp).alpha(1.0f).background(Color(0x88336699), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
    Spacer(Modifier.offset(20.dp, 460.dp).size(300.dp, 70.dp).alpha(1.0f).background(Color(0x44336699), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
    Spacer(Modifier.offset(20.dp, 550.dp).size(300.dp, 70.dp).alpha(1.0f).background(Color(0x00000000), androidx.compose.foundation.shape.GenericShape { size, _ -> moveTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 0.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(1.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 1.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); lineTo(0.000000000f * size.width, 0.000000000f * size.height); close() }))
  }
}
