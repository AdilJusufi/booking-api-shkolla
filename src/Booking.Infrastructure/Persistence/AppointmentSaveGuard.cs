using Booking.Application.Common.Exceptions;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Booking.Infrastructure.Persistence;

/// <summary>
/// SaveChanges për terminet, me gabimet e konkurrencës të përkthyera në HTTP 409.
///
/// Dy INSERT-e paralele për të njëjtin slot: secili fut rreshtin e vet, pastaj
/// kontrollon exclusion constraint-in dhe sheh rreshtin (ende të pa-commit-uar) të
/// tjetrit → secili pret tjetrin. PostgreSQL e zgjidh këtë "deadlock" pas
/// deadlock_timeout (1s) duke abortuar njërin me 40P01; EF e mbështjell atë në
/// InvalidOperationException ("transient failure"), jo në DbUpdateException — prandaj
/// më parë dilte 500 (testi DoubleBooking ~1 herë në 3 nën stres). Kërkesa e abortuar
/// nuk ka ruajtur asgjë; e riprovojmë: tani rreshti fitues ekziston dhe merr 23P01 → 409.
/// </summary>
internal static class AppointmentSaveGuard
{
    private const int MaxAttempts = 3;

    public static async Task SaveAppointmentChangesAsync(this BookingDbContext dbContext, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (DbUpdateConcurrencyException)
            {
                // Shtresa 3: optimistic concurrency (xmin) — dikush e ndryshoi terminin ndërkohë.
                throw new ConflictException(
                    "concurrency-conflict", "Termini u ndryshua nga një veprim tjetër. Rifresko dhe provo përsëri.");
            }
            catch (Exception ex) when (SqlStateOf(ex) == PostgresErrorCodes.ExclusionViolation)
            {
                // Shtresa 2: exclusion constraint (btree_gist) — sloti u zu nga kërkesa tjetër.
                throw new ConflictException("appointment-conflict", "Sloti i zgjedhur nuk është më i lirë.");
            }
            catch (Exception ex) when (SqlStateOf(ex) == PostgresErrorCodes.DeadlockDetected)
            {
                // Transaksioni u rikthye i tëri nga PostgreSQL; ndryshimet janë ende në change tracker.
                if (attempt < MaxAttempts) continue;
                throw new ConflictException(
                    "concurrency-conflict", "Termini u ndryshua nga një veprim tjetër. Rifresko dhe provo përsëri.");
            }
        }
    }

    private static string? SqlStateOf(Exception? ex)
    {
        for (; ex is not null; ex = ex.InnerException)
        {
            if (ex is PostgresException pg) return pg.SqlState;
        }

        return null;
    }
}
