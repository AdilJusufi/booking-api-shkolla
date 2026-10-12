using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Booking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ConfirmLegacyPendingAppointments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rezervimi tani konfirmohet menjëherë (AppointmentService krijon Confirmed).
            // Terminet e krijuara para këtij ndryshimi kanë mbetur "Pending" dhe pacienti
            // i sheh si "Në pritje" edhe pse askush nuk i konfirmon më — kalohen në Confirmed.
            migrationBuilder.Sql(
                "UPDATE \"Appointments\" SET \"Status\" = 'Confirmed', \"UpdatedAt\" = now() WHERE \"Status\" = 'Pending';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Pa kthim: nuk dihet më cilat termine ishin "Pending" para migrimit.
        }
    }
}
