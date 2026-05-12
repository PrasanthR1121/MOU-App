const { logStart, logEnd, logError } = require('../utils/logger');

const LOG = 'report.log';

async function saveReport(conn, project, data, reportDate) {
  const tag = `${project.RDN} | ${project.LOCATION || 'UNKNOWN'}`;

  try {
    if (!data) {
      console.warn(`⚠️  No data for ${project.RDN}, skipping`);
      return;
    }

    const rawCircle = (project.LOCATION || '').trim().toUpperCase();
    const circle    = rawCircle === 'MUM 77' ? 'MUM SIP' : rawCircle;

    console.log(`� Saving ${project.RDN} to ${circle}`);

    await conn.execute(
      `BEGIN
         MERGE INTO Project_Report_Mou_Mst T
         USING (
           SELECT
             :pid    AS Project_Id,
             :dni    AS Dni,
             :rdate  AS Report_Date,
             :tc     AS Total_Calls,
             :cin    AS Call_Duration_In,
             :min    AS Mou_In,
             :cout   AS Call_Duration_Out,
             :mout   AS Mou_Out,
             :circle AS Circle
           FROM dual
         ) S
         ON (
           T.Project_Id      = S.Project_Id
           AND T.Dni         = S.Dni
           AND T.Report_Date = S.Report_Date
           AND UPPER(T.Circle) = S.Circle
         )
         WHEN MATCHED THEN
           UPDATE SET
             T.Total_Calls       = S.Total_Calls,
             T.Call_Duration_In  = S.Call_Duration_In,
             T.Mou_In            = S.Mou_In,
             T.Call_Duration_Out = S.Call_Duration_Out,
             T.Mou_Out           = S.Mou_Out
         WHEN NOT MATCHED THEN
           INSERT (
             Id, Project_Id, Dni, Report_Date,
             Total_Calls, Call_Duration_In, Mou_In,
             Call_Duration_Out, Mou_Out, Circle
           )
           VALUES (
             Reportseq.NEXTVAL,
             S.Project_Id, S.Dni, S.Report_Date,
             S.Total_Calls, S.Call_Duration_In, S.Mou_In,
             S.Call_Duration_Out, S.Mou_Out, S.Circle
           );

         UPDATE Project_Mst
         SET Last_Update = NVL(:lu, Last_Update)
         WHERE Id = :id;
       END;`,
      {
        pid:   project.ID,
        dni:   project.RDN,
        rdate: reportDate,
        tc:    data.total_calls || 0,
        cin:   data.call_in || 0,
        min:   data.mou_in || 0,
        cout:  data.call_out || 0,
        mout:  data.mou_out || 0,
        lu:    data.d_last_update,
        id:    project.ID,
        circle: circle || ''
      }
    );

    await conn.commit();

  } catch (err) {
    logError(LOG, 'saveReport', new Error(`[${tag}] ${err.message}`));
    throw err;
  }
}

module.exports = { saveReport };