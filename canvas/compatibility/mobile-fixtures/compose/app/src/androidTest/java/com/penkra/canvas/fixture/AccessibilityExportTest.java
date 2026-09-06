package com.penkra.canvas.fixture;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AccessibilityExportTest {
  @Test public void nestedDecorationsAreHiddenWithoutHidingVisibleGroupChildren() throws Exception {
    Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
    instrumentation.startActivitySync(intent);
    JSONArray nodes = new JSONArray();
    long deadline = SystemClock.uptimeMillis() + 20000;
    do {
      nodes = new JSONArray();
      AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
      if (root != null) collect(root, nodes);
      if (find(nodes, "description", "Visible nested description") != null) break;
      SystemClock.sleep(100);
    } while (SystemClock.uptimeMillis() < deadline);
    File report = new File(instrumentation.getTargetContext().getExternalFilesDir(null), "nested-accessibility-measurement.json");
    try (FileOutputStream stream = new FileOutputStream(report)) {
      stream.write(nodes.toString(2).getBytes(StandardCharsets.UTF_8));
    }
    assertNotNull(find(nodes, "description", "Visible group description"));
    assertNotNull(find(nodes, "description", "Visible nested description"));
    for (String hidden : new String[] { "Hidden direct description", "Hidden group description", "Hidden nested description" }) assertNull(find(nodes, "description", hidden));
    for (String hidden : new String[] { "Decorative watermark", "Nested decorative content" }) assertNull(find(nodes, "text", hidden));
  }

  @Test public void exportedLabelsHeadingsAndDecorationsReachPlatformTree() throws Exception {
    Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
    instrumentation.startActivitySync(intent);
    JSONArray nodes = new JSONArray();
    long deadline = SystemClock.uptimeMillis() + 20000;
    do {
      nodes = new JSONArray();
      AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
      if (root != null) collect(root, nodes);
      if (find(nodes, "description", "Orange circle") != null) break;
      SystemClock.sleep(100);
    } while (SystemClock.uptimeMillis() < deadline);
    JSONObject evidence = new JSONObject();
    evidence.put("sdk", android.os.Build.VERSION.SDK_INT);
    evidence.put("densityDpi", instrumentation.getTargetContext().getResources().getDisplayMetrics().densityDpi);
    evidence.put("fontScale", instrumentation.getTargetContext().getResources().getConfiguration().fontScale);
    evidence.put("nodes", nodes);
    File report = new File(instrumentation.getTargetContext().getExternalFilesDir(null), "accessibility-measurement.json");
    try (FileOutputStream stream = new FileOutputStream(report)) {
      stream.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8));
    }
    assertNotNull("Root description was dropped", find(nodes, "description", "Canvas mobile export verification screen"));
    JSONObject heading = find(nodes, "description", "Native Canvas heading");
    assertNotNull("Heading description was dropped", heading);
    assertTrue("Heading trait was dropped", heading.getBoolean("heading"));
    assertNotNull("Shape description was dropped", find(nodes, "description", "Orange circle"));
    assertNotNull("Ordinary text was hidden", find(nodes, "text", "Responsive type and layout"));
    assertNull("Decorative text was exposed", find(nodes, "text", "Decorative watermark"));
  }

  private static void collect(AccessibilityNodeInfo node, JSONArray output) throws Exception {
    JSONObject value = new JSONObject();
    value.put("text", node.getText() == null ? "" : node.getText().toString());
    value.put("description", node.getContentDescription() == null ? "" : node.getContentDescription().toString());
    value.put("heading", node.isHeading());
    value.put("visible", node.isVisibleToUser());
    output.put(value);
    for (int index = 0; index < node.getChildCount(); index++) {
      AccessibilityNodeInfo child = node.getChild(index);
      if (child != null) collect(child, output);
    }
  }

  private static JSONObject find(JSONArray nodes, String key, String expected) throws Exception {
    for (int index = 0; index < nodes.length(); index++) {
      JSONObject node = nodes.getJSONObject(index);
      if (node.getString(key).equals(expected)) return node;
    }
    return null;
  }
}
