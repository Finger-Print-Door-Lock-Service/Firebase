// functions/index.js  (Node 20+ / ES Modules)
import { initializeApp }  from "firebase-admin/app";
import { getFirestore }   from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import axios              from "axios";

initializeApp();
const db = getFirestore();

/**
 * Firestore 경로: fingerprint-logs/{logId}
 * 문서가 새로 생성되면 호출
 */
export const onFingerprintLogCreated = onDocumentCreated(
  {
    document: "fingerprint-logs/{logId}",
    region: "asia-northeast3"   // 필요 시 원하는 리전으로 수정
  },
  async (event) => {
    // 새 문서 데이터
    const newLog = event.data?.data();
    if (!newLog) return;

    const deviceId = newLog.deviceIdForMqtt;
    const result   = newLog.result;

    // 성공 결과면 종료
    if (result === true || result === "success") return;

    // 동일 기기의 최근 실패 3건 조회
    const recentFailSnap = await db
      .collection("fingerprint-logs")
      .where("deviceIdForMqtt", "==", deviceId)
      .where("result", "==", false)           // "fail" 문자열이면 false → "fail"
      .orderBy("timestamp", "desc")
      .limit(3)
      .get();

    if (recentFailSnap.size < 3) return;      // 연속 3회 미만이면 종료

    // Spring 서버 알림
    const SPRING_ALERT_URL = `http://192.168.0.9:8080/alert/${deviceId}`;
    try {
      await axios.post(SPRING_ALERT_URL, {
        deviceId,
        failCount: 3,
        lastFailAt: recentFailSnap.docs[0].get("timestamp")
      });
      console.log(`Alert sent to Spring for device ${deviceId}`);
    } catch (err) {
      console.error("Failed to notify Spring:", err);
    }
  }
);
