// MARK: - UI Component — CustomDialog
//
// A reusable Compose AlertDialog driven by a MutableStateFlow<Boolean>.
//
// Design choices:
//  - Accepts a MutableStateFlow (not a lambda) for dismiss: the flow is owned by
//    the ViewModel, so tapping outside the dialog closes it through the same path
//    as pressing a button — no separate dismiss callback needed in most cases.
//  - Optional title, message, left button: absent parameters produce null slots,
//    which AlertDialog renders as empty (no extra space).
//  - Colors are theming constants (SystemBlue, Red) from the presentation layer.

package com.kikarov.tsedaclick.views

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.AlertDialog
import androidx.compose.material.Text
import androidx.compose.material.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.kikarov.tsedaclick.presentation.Red
import com.kikarov.tsedaclick.presentation.SystemBlue
import kotlinx.coroutines.flow.MutableStateFlow

@Composable
fun CustomDialog(
    showDialogMutableState: MutableStateFlow<Boolean>,
    title: String? = null,
    message: String? = null,
    onDismiss: (() -> Unit)? = null,            // null = close on tap-outside
    rightButtonText: String,
    rightButtonTextColor: Color = SystemBlue,
    onRightButtonTap: () -> Unit = {},
    leftButtonText: String? = null,             // null = no dismiss button
    leftButtonTextColor: Color = Red,
    onLeftButtonTap: () -> Unit = {}
) {
    AlertDialog(
        onDismissRequest = {
            showDialogMutableState.value = false
            onDismiss?.invoke()
        },
        title = title?.let { { Text(
            modifier = Modifier.fillMaxWidth(),
            text = it,
            fontSize = 21.sp,
            fontWeight = FontWeight.Bold
        ) } },
        text = message?.let { { Text(
            text = it,
            fontSize = 17.sp,
            fontWeight = FontWeight.Normal
        ) } },
        confirmButton = {
            TextButton(onClick = onRightButtonTap) {
                Text(
                    text = rightButtonText,
                    color = rightButtonTextColor,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        },
        dismissButton = leftButtonText?.let { label -> {
            TextButton(onClick = onLeftButtonTap) {
                Text(
                    text = label,
                    color = leftButtonTextColor,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        } }
    )
}
