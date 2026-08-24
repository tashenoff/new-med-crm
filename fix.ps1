$c = [System.IO.File]::ReadAllText('e:\new-med-crm\frontend\src\pages\CalendarPage.jsx')
$orig = "const handleStatusChange = async (appointmentId, newStatus) => {
    console.log(' Смена статуса:', appointmentId, newStatus);
    try {
      const result = await appointmentsHook.updateAppointment(appointmentId, { status: newStatus });
      if (!result.success) {
        throw new Error(result.error);
      }
      await appointmentsHook.fetchAppointments();

      if (!result.success) {
        throw new Error(result.error);
      }

      // Если прием завершен, можно добавить дополнительную логику
      if (newStatus === 'completed') {
        console.log(' Прием завершен');
      }"
$fix = "const handleStatusChange = async (appointmentId, newStatus) => {
    console.log(' Смена статуса:', appointmentId, newStatus);
    try {
      const result = await appointmentsHook.updateAppointment(appointmentId, { status: newStatus });
      if (!result.success) {
        throw new Error(result.error);
      }
      await appointmentsHook.fetchAppointments();"
$c = $c.Replace($orig, $fix)
[System.IO.File]::WriteAllText('e:\new-med-crm\frontend\src\pages\CalendarPage.jsx', $c)
