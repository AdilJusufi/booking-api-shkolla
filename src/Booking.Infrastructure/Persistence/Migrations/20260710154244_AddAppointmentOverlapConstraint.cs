using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Booking.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Garancia përfundimtare kundër double-booking, e zbatuar NGA VETË databaza.
    ///
    /// PostgreSQL exclusion constraint (kërkon extension-in btree_gist):
    /// dy rreshta appointments të të njëjtit doktor nuk mund të kenë intervale kohore
    /// që mbivendosen — kontrolluar me operatorin && mbi tstzrange — përveç nëse
    /// termini është në status jo-bllokues (i anuluar, i përfunduar, no-show, i riplanifikuar).
    ///
    /// '[)' = interval gjysmë i hapur: terminet 10:00–10:30 dhe 10:30–11:00 NUK konfliktohen.
    ///
    /// Kufizime të njohura:
    ///  - Constraint-i mbulon vetëm mbivendosjen PËR DOKTOR — mbivendosja e pacientit
    ///    (rregulli 10) kontrollohet në aplikacion.
    ///  - EF Core nuk e modelon exclusion constraint natyrshëm, prandaj SQL i papërpunuar;
    ///    kur shkelet, INSERT-i kthen SqlState 23P01 që AppointmentService e përkthen në HTTP 409.
    /// </summary>
    public partial class AddAppointmentOverlapConstraint : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""CREATE EXTENSION IF NOT EXISTS btree_gist;""");

            migrationBuilder.Sql("""
                ALTER TABLE "Appointments"
                ADD CONSTRAINT "EX_Appointments_DoctorOverlap"
                EXCLUDE USING gist (
                    "DoctorId" WITH =,
                    tstzrange("StartDateTime", "EndDateTime", '[)') WITH &&
                )
                WHERE ("Status" IN ('Pending', 'Confirmed', 'CheckedIn', 'InProgress'));
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Appointments"
                DROP CONSTRAINT IF EXISTS "EX_Appointments_DoctorOverlap";
                """);
        }
    }
}
