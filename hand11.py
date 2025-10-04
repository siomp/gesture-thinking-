import cv2
import mediapipe as mp
import numpy as np

def main():
    # Initialize MediaPipe Hands
    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands()
    mp_draw = mp.solutions.drawing_utils

    # Initialize video capture
    cap = cv2.VideoCapture(0)

    # Create a blank canvas
    canvas = np.zeros((480, 640, 3), dtype=np.uint8)

    while cap.isOpened():
        success, image = cap.read()
        if not success:
            print("Ignoring empty camera frame.")
            continue

        # Flip the image horizontally for a mirror effect
        image = cv2.flip(image, 1)
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = hands.process(image_rgb)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_draw.draw_landmarks(image_bgr, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                # Get the position of the index finger tip (landmark 8)
                index_finger = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]
                h, w, c = image_bgr.shape
                cx, cy = int(index_finger.x * w), int(index_finger.y * h)

                # Draw on the canvas
                cv2.circle(canvas, (cx, cy), 5, (0, 0, 255), -1)  # Red dot for visualization
                cv2.circle(image_bgr, (cx, cy), 5, (0, 0, 255), -1)

        # Display the image with drawings
        cv2.imshow('Hand Gesture Drawing', image_bgr)
        cv2.imshow('Canvas', canvas)

        if cv2.waitKey(5) & 0xFF == 27:  # Press 'Esc' to exit
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()