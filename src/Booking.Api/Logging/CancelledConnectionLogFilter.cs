using Serilog.Events;

namespace Booking.Api.Logging;

/// <summary>
/// EF Core 8 e shkruan çdo dështim në HAPJEN e lidhjes si Error ("An error occurred using the
/// connection to database ..."), edhe kur shkaku është thjesht anulimi i CancellationToken-it
/// (klienti u largua ndërsa Neon-i po zgjohej). Për query-t dhe SaveChanges EF-ja e njeh
/// anulimin dhe e ul në Debug; për hapjen e lidhjes jo — prandaj ky filtër.
///
/// Hidhet VETËM ajo kombinim i ngushtë: kategoria e lidhjes së EF-së + exception anulimi.
/// Çdo gabim tjetër lidhjeje (fjalëkalim i gabuar, host i paarritshëm, timeout i vërtetë —
/// NpgsqlException me TimeoutException brenda) mbetet Error siç ishte. Rreshti informues për
/// kërkesën e anuluar shkruhet nga ExceptionHandlingMiddleware.
/// </summary>
public static class CancelledConnectionLogFilter
{
    private const string EfConnectionCategory = "Microsoft.EntityFrameworkCore.Database.Connection";

    public static bool IsCancelledConnectionError(LogEvent logEvent) =>
        logEvent.Exception is OperationCanceledException
        && logEvent.Properties.TryGetValue("SourceContext", out var source)
        && source is ScalarValue { Value: EfConnectionCategory };
}
